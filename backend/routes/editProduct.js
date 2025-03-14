const express = require("express");
const db = require("../db");
const router = express.Router();

// ✅ Get product by ID for editing
router.get("/:id", (req, res) => {
    const productId = req.params.id;

    db.query("SELECT * FROM products WHERE id = ?", [productId], (err, result) => {
        if (err) return res.status(500).json({ message: "Database error" });
        if (result.length === 0) return res.status(404).json({ message: "Product not found" });

        res.json(result[0]); // Return the product details
    });
});

module.exports = router;
