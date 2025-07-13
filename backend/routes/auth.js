const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const multer = require("multer");
const path = require("path");
const router = express.Router();
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const fs = require("fs");
const logAction = require("../middleware/logAction");
const authMiddleware = require("../middleware/auth");

// Ensure the uploads directory exists
const uploadDir = "./Uploads";
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log("✅ 'Uploads/' directory created");
}

// Multer Setup for Image Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "Uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Admin/Staff Signup with Image Upload
router.post("/signup", upload.single("profile_picture"), async (req, res) => {
    const { name, email, password, role } = req.body;
    const profilePicture = req.file ? req.file.filename : "default-profile.png";

    if (!name || !email || !password || !role) {
        return res.status(400).json({ message: "All fields are required." });
    }
    if (!["admin", "staff"].includes(role)) {
        return res.status(400).json({ message: "Invalid role. Choose 'admin' or 'staff'." });
    }

    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
        if (err) return res.status(500).json({ message: "Database error", error: err });
        if (result.length > 0) {
            return res.status(400).json({ message: "Email already registered" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        db.query(
            "INSERT INTO users (name, email, password, role, profile_picture) VALUES (?, ?, ?, ?, ?)",
            [name, email, hashedPassword, role, profilePicture],
            (err, result) => {
                if (err) return res.status(500).json({ message: "Database error", error: err });
                res.status(201).json({
                    message: `${role} account created successfully`,
                    profile_picture: profilePicture
                });
            }
        );
    });
});

// User Login with logging
router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password required" });
        }

        db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
            if (err) {
                console.error("[auth] Database error:", err);
                return res.status(500).json({ message: "Server error" });
            }
            if (results.length === 0) {
                return res.status(401).json({ message: "Invalid credentials" });
            }

            const user = results[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ message: "Invalid credentials" });
            }

            const token = jwt.sign(
                { id: user.id, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: "1h" }
            );

            console.log("[auth] Login successful, token generated:", { userId: user.id, token });
            req.user = { id: user.id, role: user.role }; // Set req.user for logAction
            logAction("login")(req, res, () => {
                res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
            });
        });
    } catch (error) {
        console.error("[auth] Login error:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// User Logout with logging
router.post("/logout", authMiddleware, (req, res) => {
    try {
        logAction("logout")(req, res, () => {
            res.json({ message: "Logged out successfully" });
        });
    } catch (error) {
        console.error("[auth] Logout error:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// Fetch User Details (Admin & Staff)
router.get("/user/:id", authMiddleware, (req, res) => {
    const userId = req.params.id;

    db.query("SELECT id, name, email, role, profile_picture FROM users WHERE id = ?", [userId], (err, results) => {
        if (err) return res.status(500).json({ message: "Database error", error: err });
        if (results.length === 0) return res.status(404).json({ message: "User not found" });
        res.json(results[0]);
    });
});

// Update Profile Picture (for existing users)
router.post("/upload-profile", authMiddleware, upload.single("profile_picture"), (req, res) => {
    const { user_id } = req.body;

    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded." });
    }

    const profilePicture = req.file.filename;

    db.query("UPDATE users SET profile_picture = ? WHERE id = ?", [profilePicture, user_id], (err, result) => {
        if (err) return res.status(500).json({ message: "Database error", error: err });
        res.json({
            message: "Profile picture updated successfully",
            profile_picture: profilePicture
        });
    });
});

// Forgot Password
router.post("/forgot-password", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    if (!process.env.RESET_SECRET) {
        console.error("[auth] RESET_SECRET is not defined in environment variables");
        return res.status(500).json({ message: "Server configuration error" });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error("[auth] Email configuration missing:", {
            EMAIL_USER: process.env.EMAIL_USER,
            EMAIL_PASS: process.env.EMAIL_PASS ? "****" : undefined
        });
        return res.status(500).json({ message: "Email configuration error" });
    }

    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
        if (err) {
            console.error("[auth] Database error:", err);
            return res.status(500).json({ message: "Database error", error: err });
        }
        if (result.length === 0) {
            return res.status(404).json({ message: "Email not found" });
        }

        const user = result[0];
        try {
            const token = jwt.sign({ id: user.id }, process.env.RESET_SECRET, { expiresIn: "1h" });
            const resetTokenExpiry = Date.now() + 3600000; // 1 hour

            db.query(
                "UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?",
                [token, resetTokenExpiry, email],
                async (err) => {
                    if (err) {
                        console.error("[auth] Database error updating reset token:", err);
                        return res.status(500).json({ message: "Database error" });
                    }
                    try {
                        const transporter = nodemailer.createTransport({
                            host: "smtp.gmail.com",
                            port: 587,
                            secure: false, // Use TLS
                            auth: {
                                user: process.env.EMAIL_USER,
                                pass: process.env.EMAIL_PASS
                            }
                        });

                        const resetLink = `http://localhost:3000/reset-password/${token}`;
                        await transporter.sendMail({
                            from: `"Inventory Store" <${process.env.EMAIL_USER}>`,
                            to: email,
                            subject: "Password Reset Request",
                            text: `Click the following link to reset your password: ${resetLink}\nThis link expires in 1 hour.`,
                            html: `<p>Click <a href="${resetLink}">here</a> to reset your password. This link expires in 1 hour.</p>`
                        });

                        console.log("[auth] Reset link sent:", { email, resetLink });
                        res.status(200).json({ message: "Reset link sent to your email." });
                    } catch (emailError) {
                        console.error("[auth] Email sending error:", {
                            message: emailError.message,
                            code: emailError.code,
                            response: emailError.response
                        });
                        res.status(500).json({ message: "Failed to send reset email. Please try again." });
                    }
                }
            );
        } catch (jwtError) {
            console.error("[auth] JWT signing error:", jwtError);
            res.status(500).json({ message: "Error generating reset token" });
        }
    });
});

// Reset Password
router.post("/reset-password", async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: "Token and password are required" });

    db.query("SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > ?", [token, Date.now()], async (err, result) => {
        if (err) return res.status(500).json({ message: "Database error", error: err });
        if (result.length === 0) return res.status(400).json({ message: "Invalid or expired token" });

        const user = result[0];
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        db.query(
            "UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?",
            [hashedPassword, user.id],
            (err) => {
                if (err) return res.status(500).json({ message: "Database error" });
                res.status(200).json({ message: "Password reset successful" });
            }
        );
    });
});

module.exports = router;