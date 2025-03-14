const express = require("express");
const db = require("../db");
const router = express.Router();

router.get("/all", (req, res) => {
    db.query("SELECT * FROM products", (err, result) => {
        if (err) return res.status(500).json({ message: "Database error" });
        res.json(result);
    });
});


// ✅ Get Product by ID
router.get("/:id", (req, res) => {
    const productId = req.params.id;
    db.query("SELECT * FROM products WHERE id = ?", [productId], (err, result) => {
        if (err) return res.status(500).json({ message: "Database error" });
        if (result.length === 0) return res.status(404).json({ message: "Product not found" });
        res.json(result[0]);
    });
});

// ✅ Update Product
router.put("/update/:id", (req, res) => {
    const productId = req.params.id;
    const { name, stock, price, description } = req.body;

    db.query(
        "UPDATE products SET name = ?, stock = ?, price = ?, description = ? WHERE id = ?",
        [name, stock, price, description, productId],
        (err, result) => {
            if (err) return res.status(500).json({ message: "Error updating product" });
            res.json({ message: "Product updated successfully" });
        }
    );
});

module.exports = router;
