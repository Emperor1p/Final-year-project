const db = require("../db");

module.exports = (action) => {
  return (req, res, next) => {
    if (req.user && req.user.id) {
      const query = "INSERT INTO activity_logs (user_id, action, created_at) VALUES (?, ?, NOW())";
      db.query(query, [req.user.id, action], (err) => {
        if (err) {
          console.error(`Error logging action '${action}':`, err);
        }
        next();
      });
    } else {
      console.warn("No user ID found for logging action:", action);
      next();
    }
  };
};