const express = require("express");
const db = require("../db");
const router = express.Router();

// ✅ Fetch all transactions
router.get("/", (req, res) => {
    const query = `
        SELECT transactions.id, products.name AS product_name, transactions.quantity, 
               transactions.total_price, users.name AS staff_name, transactions.sold_at
        FROM transactions
        JOIN products ON transactions.product_id = products.id
        JOIN users ON transactions.user_id = users.id
        ORDER BY transactions.sold_at DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ message: "Database error", error: err });
        }
        res.json(results);
    });
});

// ✅ Add a new transaction (when a product is sold)
router.post("/add", (req, res) => {
    const { product_id, user_id, quantity, total_price } = req.body;

    if (!product_id || !user_id || !quantity || !total_price) {
        return res.status(400).json({ message: "All fields are required" });
    }

    const insertQuery = `
        INSERT INTO transactions (product_id, user_id, quantity, total_price)
        VALUES (?, ?, ?, ?)
    `;

    db.query(insertQuery, [product_id, user_id, quantity, total_price], (err, result) => {
        if (err) {
            return res.status(500).json({ message: "Database error", error: err });
        }

        // ✅ Reduce stock in products table
        const updateStockQuery = `UPDATE products SET stock = stock - ? WHERE id = ?`;
        db.query(updateStockQuery, [quantity, product_id]);

        res.status(201).json({ message: "Transaction recorded successfully" });
    });
});

module.exports = router;
