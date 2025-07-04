const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/stats", (req, res) => {
    const { filter_type, start_date, end_date } = req.query;
    let productParams = [];
    let salesParams = [];
    let staffParams = [];
    let effectiveEndDate;

    // Validate filter_type
    if (filter_type && !["monthly", "range"].includes(filter_type)) {
        return res.status(400).json({ message: "Invalid filter_type. Use 'monthly' or 'range'." });
    }

    // Validate date format (YYYY-MM-DD)
    const isValidDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
    if (start_date && !isValidDate(start_date)) {
        return res.status(400).json({ message: "Invalid start_date format. Use YYYY-MM-DD." });
    }
    if (end_date && !isValidDate(end_date)) {
        return res.status(400).json({ message: "Invalid end_date format. Use YYYY-MM-DD." });
    }

    // Determine effective end_date and build filters
    if (filter_type === "monthly" && start_date) {
        // For monthly, use the last day of the selected month
        effectiveEndDate = new Date(new Date(start_date).setMonth(new Date(start_date).getMonth() + 1)).toISOString().split('T')[0];
        productParams = [effectiveEndDate, effectiveEndDate]; // For created_at and deleted_at
        salesParams = [start_date, `${effectiveEndDate} 23:59:59`]; // For transactions
        staffParams = [`${effectiveEndDate} 23:59:59`]; // For staff created_at
    } else if (filter_type === "range" && start_date && end_date) {
        // For range, use end_date + 1 day to include full end_date
        const endDateObj = new Date(end_date);
        endDateObj.setDate(endDateObj.getDate() + 1);
        effectiveEndDate = endDateObj.toISOString().split('T')[0] + ' 00:00:00'; // e.g., 2025-07-05 00:00:00
        productParams = [effectiveEndDate, effectiveEndDate]; // For created_at and deleted_at
        salesParams = [start_date, effectiveEndDate]; // For transactions
        staffParams = [effectiveEndDate]; // For staff created_at
    } else {
        // Default: use current date with full day
        effectiveEndDate = new Date().toISOString().split('T')[0] + ' 23:59:59'; // e.g., 2025-07-04 23:59:59
        productParams = [effectiveEndDate, effectiveEndDate];
        salesParams = [];
        staffParams = [effectiveEndDate];
    }

    // Query for total_products (created on or before effectiveEndDate and active)
    const productQuery = `
        SELECT COUNT(DISTINCT id) AS total_products 
        FROM (
            SELECT p.id
            FROM products p
            LEFT JOIN product_history ph ON p.id = ph.product_id
            WHERE p.created_at <= ?
            AND (ph.id IS NULL OR ph.deleted_at IS NULL OR ph.deleted_at > ?)
        ) AS combined
    `;
    // Query for total_sales and total_transactions
    const salesQuery = `
        SELECT COALESCE(SUM(t.total_price), 0) AS total_sales, 
               COUNT(t.id) AS total_transactions 
        FROM transactions t
        ${filter_type ? 'WHERE t.sold_at >= ? AND t.sold_at < ?' : ''}
    `;
    // Query for active_staff (created on or before effectiveEndDate)
    const staffQuery = `
        SELECT COUNT(*) AS active_staff 
        FROM users 
        WHERE role = 'staff' AND created_at <= ?
    `;

    // Log for debugging
    console.log("[Dashboard] req.query:", req.query);
    console.log("[Dashboard] effectiveEndDate:", effectiveEndDate);
    console.log("[Dashboard] productQuery:", productQuery);
    console.log("[Dashboard] productParams:", productParams);
    console.log("[Dashboard] salesQuery:", salesQuery);
    console.log("[Dashboard] salesParams:", salesParams);
    console.log("[Dashboard] staffQuery:", staffQuery);
    console.log("[Dashboard] staffParams:", staffParams);

    // Execute queries
    db.query(productQuery, productParams, (err, productResult) => {
        if (err) {
            console.error("[Dashboard] Error fetching products:", err);
            return res.status(500).json({ message: "Database error: " + err.message });
        }

        db.query(salesQuery, salesParams, (err, salesResult) => {
            if (err) {
                console.error("[Dashboard] Error fetching sales:", err);
                return res.status(500).json({ message: "Database error: " + err.message });
            }

            db.query(staffQuery, staffParams, (err, staffResult) => {
                if (err) {
                    console.error("[Dashboard] Error fetching staff:", err);
                    return res.status(500).json({ message: "Database error: " + err.message });
                }

                res.json({
                    total_products: productResult[0].total_products || 0,
                    total_sales: salesResult[0].total_sales || 0,
                    total_transactions: salesResult[0].total_transactions || 0,
                    active_staff: staffResult[0].active_staff || 0,
                });
            });
        });
    });
});

module.exports = router;