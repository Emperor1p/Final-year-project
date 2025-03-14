const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const router = express.Router();

// ✅ Test if API is working
router.get("/test", (req, res) => {
    res.json({ message: "Staff API is working!" });
});

// ✅ Admin Creates a Staff Account
router.post("/create-staff", async (req, res) => {
    const { name, email, password } = req.body;
    const role = "staff"; // Default role

    if (!name || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
    }

    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });

        if (result.length > 0) {
            return res.status(400).json({ message: "Email already exists" });
        }

        // ✅ Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // ✅ Insert staff into database
        db.query(
            "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
            [name, email, hashedPassword, role],
            (err, result) => {
                if (err) return res.status(500).json({ error: "Error inserting into database" });
                res.status(201).json({ message: "Staff account created successfully" });
            }
        );
    });
});


router.get("/all", (req, res) => {
    db.query("SELECT id, name, email FROM users WHERE role = 'staff'", (err, results) => {
        if (err) return res.status(500).json({ message: "Database error" });
        res.json(results);
    });
});

// ✅ Delete staff
router.delete("/delete/:id", (req, res) => {
    const staffId = req.params.id;
    db.query("DELETE FROM users WHERE id = ?", [staffId], (err, result) => {
        if (err) return res.status(500).json({ message: "Error deleting staff" });
        res.json({ message: "Staff deleted successfully" });
    });
});


module.exports = router;
