const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log("[AuthMiddleware] Header:", authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn("[AuthMiddleware] No token provided");
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your_jwt_secret");
    console.log("[AuthMiddleware] Decoded:", decoded);
    req.user = decoded; // { id, role }
    next();
  } catch (error) {
    console.error("[AuthMiddleware] Token Error:", error.message);
    return res.status(401).json({ message: "Invalid token" });
  }
};