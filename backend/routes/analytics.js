const express = require("express");
const router = express.Router();
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const checkPermission = require("../middleware/checkPermission");

// Get top 5 selling products
router.get("/top-products", authMiddleware, checkPermission("view_products"), (req, res) => {
  db.query(
    `SELECT p.name, SUM(t.quantity) as total_quantity
     FROM transactions t
     INNER JOIN products p ON t.product_id = p.id
     GROUP BY p.id, p.name
     ORDER BY total_quantity DESC
     LIMIT 10`,
    (err, result) => {
      if (err) {
        console.error("[Analytics] Error fetching top products:", err);
        return res.status(500).json({ message: "Database error" });
      }
      res.json(result);
    }
  );
});

// Get sales over time
router.get("/sales-over-time", authMiddleware, checkPermission("view_transactions"), (req, res) => {
  const range = parseInt(req.query.range) || 30;
  if (![7, 30, 90].includes(range)) {
    return res.status(400).json({ message: "Invalid range. Use 7, 30, or 90 days." });
  }

  db.query(
    `SELECT DATE(t.sold_at) as date, SUM(t.total_price) as total_sales
     FROM transactions t
     WHERE t.sold_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(t.sold_at)
     ORDER BY date ASC`,
    [range],
    (err, result) => {
      if (err) {
        console.error("[Analytics] Error fetching sales over time:", err);
        return res.status(500).json({ message: "Database error" });
      }
      res.json(result);
    }
  );
});

// Get stock levels
router.get("/stock-levels", authMiddleware, checkPermission("view_products"), (req, res) => {
  db.query(
    `SELECT 
       SUM(CASE WHEN stock < 10 AND stock > 0 THEN 1 ELSE 0 END) as low_stock,
       SUM(CASE WHEN stock >= 10 THEN 1 ELSE 0 END) as sufficient_stock,
       SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) as out_of_stock
     FROM products`,
    (err, result) => {
      if (err) {
        console.error("[Analytics] Error fetching stock levels:", err);
        return res.status(500).json({ message: "Database error" });
      }
      res.json(result[0]);
    }
  );
});

module.exports = router;