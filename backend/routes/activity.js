const express = require("express");
const router = express.Router();
const db = require("../db");
const authMiddleware = require("../middleware/auth");

// GET activity logs with filtering
router.get("/logs", authMiddleware, async (req, res) => {
    try {
        const { user_id, action, start_date, end_date } = req.query;

        console.log("User:", req.user);
        if (!req.user || req.user.role !== "admin") {
            console.warn(`Unauthorized access attempt by user ${req.user?.id || "unknown"}`);
            return res.status(403).json({ message: "Access denied: Admins only" });
        }

        let query = `
            SELECT al.id, u.name AS user_name, u.role, al.action, al.created_at
            FROM activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
        `;
        const values = [];

        const conditions = [];
        if (user_id) {
            conditions.push("al.user_id = ?");
            values.push(user_id);
        }
        if (action) {
            conditions.push("al.action = ?");
            values.push(action);
        }
        if (start_date) {
            conditions.push("al.created_at >= ?");
            values.push(start_date);
        }
        if (end_date) {
            conditions.push("al.created_at <= ?");
            values.push(`${end_date} 23:59:59.999999`); // Ensure full day
        }

        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }

        query += " ORDER BY al.created_at DESC";

        console.log("Executing query:", query, "with values:", values);

        db.query(query, values, (err, results) => {
            if (err) {
                console.error("Database error:", err);
                return res.status(500).json({ message: "Failed to fetch logs", error: err.message });
            }
            console.log("Logs fetched:", results.length);
            res.json(results);
        });
    } catch (error) {
        console.error("Unexpected error in /logs:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// GET users for filter dropdown
router.get("/users", authMiddleware, async (req, res) => {
    try {
        if (!req.user || req.user.role !== "admin") {
            console.warn(`Unauthorized access attempt by user ${req.user?.id || "unknown"}`);
            return res.status(403).json({ message: "Access denied: Admins only" });
        }

        const query = "SELECT id, name FROM users WHERE role IN ('admin', 'staff')";
        db.query(query, (err, results) => {
            if (err) {
                console.error("Database error:", err);
                return res.status(500).json({ message: "Failed to fetch users", error: err.message });
            }
            console.log("Users fetched:", results);
            res.json(results);
        });
    } catch (error) {
        console.error("Unexpected error in /users:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// GET distinct actions for filter dropdown
router.get("/actions", authMiddleware, async (req, res) => {
    try {
        if (!req.user || req.user.role !== "admin") {
            console.warn(`Unauthorized access attempt by user ${req.user?.id || "unknown"}`);
            return res.status(403).json({ message: "Access denied: Admins only" });
        }

        const query = "SELECT DISTINCT action FROM activity_logs";
        db.query(query, (err, results) => {
            if (err) {
                console.error("Database error:", err);
                return res.status(500).json({ message: "Failed to fetch actions", error: err.message });
            }
            const actions = results.map((row) => row.action);
            console.log("Actions fetched:", actions);
            res.json(actions);
        });
    } catch (error) {
        console.error("Unexpected error in /actions:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

module.exports = router;