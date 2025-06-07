// // backend/routes/notifications.js
// const express = require("express");
// const router = express.Router();
// const db = require("../db");
// const authMiddleware = require("../middleware/auth");
// const checkPermission = require("../middleware/checkPermission");
// const logAction = require("../middleware/logAction");

// // GET notifications for a user (authenticated, requires view_notifications or staff role)
// router.get(
//   "/",
//   authMiddleware,
//   (req, res) => {
//     const userId = req.user.id;
//     db.query(
//       "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC",
//       [userId],
//       (err, results) => {
//         if (err) {
//           console.error("[Notifications] Error fetching notifications:", err);
//           return res.status(500).json({ message: "Database error" });
//         }
//         res.json(results);
//       }
//     );
//   }
// );

// // MARK notification as read (authenticated)
// router.put(
//   "/read/:id",
//   authMiddleware,
//   (req, res) => {
//     const notificationId = req.params.id;
//     const userId = req.user.id;
//     db.query(
//       "UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?",
//       [notificationId, userId],
//       (err, result) => {
//         if (err) {
//           console.error("[Notifications] Error marking notification as read:", err);
//           return res.status(500).json({ message: "Database error" });
//         }
//         if (result.affectedRows === 0) {
//           return res.status(404).json({ message: "Notification not found or access denied" });
//         }
//         res.json({ message: "Notification marked as read" });
//       }
//     );
//   }
// );

// // ADD notification (admin only, requires assign_notifications)
// router.post(
//   "/",
//   authMiddleware,
//   checkPermission("assign_notifications"),
//   logAction("Added notification"),
//   (req, res) => {
//     const { userId, message } = req.body;
//     if (!userId || !message) {
//       return res.status(400).json({ message: "userId and message are required" });
//     }
//     if (req.user.role !== "admin") {
//       return res.status(403).json({ message: "Access denied: Admins only" });
//     }
//     db.query(
//       "INSERT INTO notifications (user_id, message) VALUES (?, ?)",
//       [userId, message],
//       (err) => {
//         if (err) {
//           console.error("[Notifications] Error adding notification:", err);
//           return res.status(500).json({ message: "Database error" });
//         }
//         res.json({ message: "Notification added successfully" });
//       }
//     );
//   }
// );

// module.exports = router;