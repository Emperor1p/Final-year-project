// backend/middleware/auth.js (create or update)
const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log("[authMiddleware] Auth Header:", authHeader ? "Present" : "Missing"); // Debug

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.error("[authMiddleware] No token provided");
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("[authMiddleware] Token decoded:", { userId: decoded.id }); // Debug
    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (err) {
    console.error("[authMiddleware] Token error:", err.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};