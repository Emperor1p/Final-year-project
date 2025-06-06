const db = require("../db"); // Import the MySQL connection

exports.getSalesOverTime = async (req, res) => {
  try {
    const query = `
      SELECT 
        DATE_FORMAT(sold_at, '%M') AS month, 
        SUM(total_price) AS sales
      FROM transactions
      GROUP BY MONTH(sold_at)
      ORDER BY MONTH(sold_at);
    `;
    db.query(query, (err, results) => {
      if (err) {
        console.error("Error fetching sales data:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.json(results);
    });
  } catch (error) {
    console.error("Error fetching sales over time:", error);
    res.status(500).json({ message: "Error fetching sales data." });
  }
};