const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const router = express.Router();
const multer = require("multer");
const path = require("path");

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "Uploads/");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${file.fieldname}${ext}`;
    cb(null, filename);
  },
});
const upload = multer({ storage });

// Test API route
router.get("/test", (req, res) => {
  res.json({ message: "Staff API is working!" });
});

// Admin creates a Staff or Admin account
router.post("/create-staff", upload.single("profile_picture"), async (req, res) => {
  const { name, email, password, role } = req.body;
  const profilePicture = req.file ? req.file.filename : null;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: "All fields are required" });
  }

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (result.length > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    db.query(
      "INSERT INTO users (name, email, password, role, profile_picture) VALUES (?, ?, ?, ?, ?)",
      [name, email, hashedPassword, role, profilePicture],
      (err, result) => {
        if (err) return res.status(500).json({ message: "Error inserting into database" });
        res.status(201).json({ message: "Account created successfully" });
      }
    );
  });
});

// Get all staff (include profile_picture)
router.get("/all", (req, res) => {
  db.query(
    "SELECT id, name, email, profile_picture FROM users WHERE role = 'staff'",
    (err, results) => {
      if (err) return res.status(500).json({ message: "Database error" });
      res.json(results);
    }
  );
});

// Delete staff
router.delete("/delete/:id", (req, res) => {
  const staffId = req.params.id;
  db.query("DELETE FROM users WHERE id = ? AND role = 'staff'", [staffId], (err, result) => {
    if (err) return res.status(500).json({ message: "Error deleting staff" });
    if (result.affectedRows === 0) return res.status(404).json({ message: "Staff not found" });
    res.json({ message: "Staff deleted successfully" });
  });
});

// Get single staff by ID
router.get("/:id", (req, res) => {
  const staffId = req.params.id;
  db.query(
    "SELECT id, name, email, profile_picture FROM users WHERE id = ? AND role = 'staff'",
    [staffId],
    (err, results) => {
      if (err) return res.status(500).json({ message: "Database error" });
      if (results.length === 0) return res.status(404).json({ message: "Staff not found" });
      res.json(results[0]);
    }
  );
});

// Update staff (name, email, and optional profile_picture)
router.put("/update/:id", upload.single("profile_picture"), (req, res) => {
  const staffId = req.params.id;
  const { name, email } = req.body;
  const profilePicture = req.file ? req.file.filename : null;

  if (!name || !email) {
    return res.status(400).json({ message: "Name and email are required" });
  }

  // Build dynamic query based on whether a new image is uploaded
  let query = "UPDATE users SET name = ?, email = ?";
  const values = [name, email];
  if (profilePicture) {
    query += ", profile_picture = ?";
    values.push(profilePicture);
  }
  query += " WHERE id = ? AND role = 'staff'";
  values.push(staffId);

  db.query(query, values, (err, result) => {
    if (err) return res.status(500).json({ message: "Error updating staff" });
    if (result.affectedRows === 0) return res.status(404).json({ message: "Staff not found" });
    res.json({ message: "Staff updated successfully" });
  });
});

module.exports = router;