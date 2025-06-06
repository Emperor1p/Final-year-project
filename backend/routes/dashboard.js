const express = require("express");
const db = require("../db");
const router = express.Router();
const dashboardController = require("../controllers/dashboardcontroller");

router.get("/stats", (req, res) => {
  const statsQuery = `
    SELECT 
      (SELECT COUNT(*) FROM products) AS total_products,
      (SELECT SUM(total_price) FROM transactions) AS total_sales,
      (SELECT COUNT(*) FROM users WHERE role = 'staff') AS active_staff,
      (SELECT COUNT(*) FROM transactions) AS total_transactions;
  `;
  db.query(statsQuery, (err, result) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(result[0]);
  });
});

router.get("/sales-over-time", dashboardController.getSalesOverTime);

module.exports = router;