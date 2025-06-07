const db = require("../db");

module.exports = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Unauthorized: No user data" });
        }
        if (req.user.role === "admin") {
            return next();
        }
        db.query(
            "SELECT permission FROM permissions WHERE user_id = ? AND permission = ?",
            [req.user.id, permission],
            (err, result) => {
                if (err) {
                    console.error("Permission error:", err);
                    return res.status(500).json({ message: "Database error" });
                }
                if (result.length === 0) {
                    return res.status(403).json({ message: "Permission denied" });
                }
                next();
            }
        );
    };
};