const express = require("express");
const router = express.Router();
const db = require("../db");
const authMiddleware = require("../middleware/auth");
const logAction = require("../middleware/logAction");
const checkPermission = require("../middleware/checkPermission");

// GET all users (admin only)
router.get("/", authMiddleware, checkPermission("view_users"), (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Unauthorized Access" });
  }
  db.query("SELECT id, name, email, role FROM users", (err, result) => {
    if (err) {
      console.error("[Users] Error fetching users:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(result);
  });
});

// GET user permissions (admin only)
router.get("/:id/permissions", authMiddleware, checkPermission("view_users"), (req, res) => {
  const userId = req.params.id;
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Unauthorized Access" });
  }
  db.query(
    "SELECT permission FROM permissions WHERE user_id = ?",
    [userId],
    (err, result) => {
      if (err) {
        console.error("[Users] Error fetching permissions:", err);
        return res.status(500).json({ message: "Database error" });
      }
      res.json({ permissions: result.map((row) => row.permission) });
    }
  );
});

// POST assign permissions (admin only)
router.post("/permissions", authMiddleware, checkPermission("assign_permissions"), logAction("Assigned permission"), (req, res) => {
  const { userId, permission } = req.body;
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Unauthorized Access" });
  }
  if (!userId || !permission) {
    return res.status(400).json({ message: "User ID and permission are required" });
  }
  if (!["view_products", "edit_products", "view_transactions"].includes(permission)) {
    return res.status(400).json({ message: "Invalid permission" });
  }

  // Check user's role
  db.query("SELECT role FROM users WHERE id = ?", [userId], (err, result) => {
    if (err) {
      console.error("[Users] Error checking user role:", err);
      return res.status(500).json({ message: "Database error" });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    const userRole = result[0].role;
    if (userRole === "staff" && !["view_products"].includes(permission)) {
      return res.status(400).json({ message: "Staff can only have view_products permission" });
    }

    db.query(
      "INSERT INTO permissions (user_id, permission) VALUES (?, ?) ON DUPLICATE KEY UPDATE permission = ?",
      [userId, permission, permission],
      (err) => {
        if (err) {
          console.error("[Users] Error assigning permission:", err);
          return res.status(500).json({ message: "Database error while assigning permission" });
        }
        res.json({ message: "Permission assigned successfully" });
      }
    );
  });
});

// DELETE permission (admin only)
router.delete("/permissions", authMiddleware, checkPermission("assign_permissions"), logAction("Revoked permission"), (req, res) => {
  const { userId, permission } = req.body;
  if (!userId || !permission) {
    return res.status(400).json({ message: "User ID and permission are required" });
  }
  db.query(
    "DELETE FROM permissions WHERE user_id = ? AND permission = ?",
    [userId, permission],
    (err, result) => {
      if (err) {
        console.error("[Users] Error revoking permission:", err);
        return res.status(500).json({ message: "Database error" });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Permission not found" });
      }
      res.json({ message: "Permission revoked successfully" });
    }
  );
});

module.exports = router;