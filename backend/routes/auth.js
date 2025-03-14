const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const multer = require("multer");
const path = require("path");
const router = express.Router();

const fs = require("fs");

// ✅ Ensure the uploads directory exists
const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log("✅ 'uploads/' directory created");
}


// ✅ Multer Setup for Image Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/"); // ✅ Save images in 'uploads/' folder
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // ✅ Unique filename
    }
});
const upload = multer({ storage: storage });

// ✅ Admin/Staff Signup with Image Upload
router.post("/signup", upload.single("profile_picture"), async (req, res) => {
    const { name, email, password, role } = req.body;
    const profilePicture = req.file ? req.file.filename : "default-profile.png"; // ✅ Default image if none uploaded

    if (!name || !email || !password || !role) {
        return res.status(400).json({ message: "All fields are required." });
    }
    if (!["admin", "staff"].includes(role)) {
        return res.status(400).json({ message: "Invalid role. Choose 'admin' or 'staff'." });
    }

    // ✅ Check if email is already registered
    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
        if (err) return res.status(500).json({ message: "Database error", error: err });

        if (result.length > 0) {
            return res.status(400).json({ message: "Email already registered" });
        }

        // ✅ Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // ✅ Insert user with profile picture
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

// ✅ User Login
router.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
    }

    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
        if (err) return res.status(500).json({ message: "Database error", error: err });
        if (result.length === 0) return res.status(400).json({ message: "User not found" });

        const user = result[0];
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // ✅ Generate JWT Token
        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        res.json({
            message: "Login successful",
            token,
            user_id: user.id,
            role: user.role,
            profile_picture: user.profile_picture || "default-profile.png" // ✅ Ensure there's always a profile picture
        });
    });
});

// ✅ Fetch User Details (Admin & Staff)
router.get("/user/:id", (req, res) => {
    const userId = req.params.id;

    db.query("SELECT id, name, email, role, profile_picture FROM users WHERE id = ?", [userId], (err, results) => {
        if (err) return res.status(500).json({ message: "Database error", error: err });
        if (results.length === 0) return res.status(404).json({ message: "User not found" });

        res.json(results[0]);
    });
});

// ✅ Update Profile Picture (for existing users)
router.post("/upload-profile", upload.single("profile_picture"), (req, res) => {
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

module.exports = router;
