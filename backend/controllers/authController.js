const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();

// Configure multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + ext);
    }
});
const upload = multer({ storage });

// Signup route
router.post("/signup", upload.single("profile_picture"), async (req, res) => {
    const { name, email, password, role } = req.body;
    const profilePicture = req.file?.filename;

    if (!name || !email || !password || !role || !profilePicture) {
        return res.status(400).json({ message: "All fields including profile picture are required." });
    }

    // Save to DB (pseudo-code)
    await db.query("INSERT INTO users (name, email, password, role, profile_picture) VALUES (?, ?, ?, ?, ?)", 
        [name, email, password, role, profilePicture]);

    res.status(201).json({ message: "Account created successfully." });
});
