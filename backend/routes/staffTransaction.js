const express = require("express");
const db = require("../db");
const router = express.Router();

// ✅ Staff: Fetch own transactions
router.get("/", (req, res) => {
    const { filterType, startDate, endDate, userId } = req.query;

    if (!userId) {
        return res.status(400).json({ message: "Missing userId (staff ID)" });
    }

    let baseQuery = `
        SELECT transactions.id, products.name AS product_name, transactions.quantity, 
               transactions.total_price, users.name AS user_name, transactions.sold_at
        FROM transactions
        JOIN products ON transactions.product_id = products.id
        JOIN users ON transactions.user_id = users.id
        WHERE transactions.user_id = ?
    `;

    let queryParams = [userId];

    if (filterType && startDate) {
        const start = new Date(startDate);
        let end = endDate ? new Date(endDate) : new Date(startDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        switch (filterType) {
            case "daily":
            case "weekly":
            case "range":
                baseQuery += " AND transactions.sold_at BETWEEN ? AND ?";
                queryParams.push(start, end);
                break;
            case "monthly":
                baseQuery += " AND MONTH(transactions.sold_at) = ? AND YEAR(transactions.sold_at) = ?";
                queryParams.push(start.getMonth() + 1, start.getFullYear());
                break;
            case "yearly":
                baseQuery += " AND YEAR(transactions.sold_at) = ?";
                queryParams.push(start.getFullYear());
                break;
        }
    }

    baseQuery += " ORDER BY transactions.sold_at DESC";

    db.query(baseQuery, queryParams, (err, results) => {
        if (err) return res.status(500).json({ message: "Database error", error: err });
        res.json(results);
    });
});

module.exports = router;
