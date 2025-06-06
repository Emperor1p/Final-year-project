const express = require("express");
const db = require("../db");
const router = express.Router();

// ✅ Fetch transactions with optional filters
router.get("/", (req, res) => {
    const { filterType, startDate, endDate } = req.query;

    let baseQuery = `
        SELECT transactions.id, products.name AS product_name, transactions.quantity, 
               transactions.total_price, users.name AS user_name, transactions.sold_at
        FROM transactions
        JOIN products ON transactions.product_id = products.id
        JOIN users ON transactions.user_id = users.id
    `;

    let whereClause = "";
    let queryParams = [];

    if (filterType && startDate) {
        const start = new Date(startDate);
        let end = endDate ? new Date(endDate) : new Date(startDate);

        // Normalize to full-day timestamps
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        switch (filterType) {
            case "daily":
                whereClause = "WHERE transactions.sold_at BETWEEN ? AND ?";
                queryParams.push(start, end);
                break;
            case "weekly":
            case "range":
                whereClause = "WHERE transactions.sold_at BETWEEN ? AND ?";
                queryParams.push(start, end);
                break;
            case "monthly":
                whereClause = "WHERE MONTH(transactions.sold_at) = ? AND YEAR(transactions.sold_at) = ?";
                queryParams.push(start.getMonth() + 1, start.getFullYear());
                break;
            case "yearly":
                whereClause = "WHERE YEAR(transactions.sold_at) = ?";
                queryParams.push(start.getFullYear());
                break;
            default:
                break;
        }
    }

    const finalQuery = `${baseQuery} ${whereClause} ORDER BY transactions.sold_at DESC`;

    db.query(finalQuery, queryParams, (err, results) => {
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
