const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  // Extract token from Authorization header (e.g., "Bearer <token>")
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  try {
    // Verify token using JWT_SECRET from .env
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach user data (e.g., { id, role }) to request
    next(); // Proceed to the next middleware/route handler
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = authMiddleware;