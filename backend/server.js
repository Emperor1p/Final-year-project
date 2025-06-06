const express = require("express");
const cors = require("cors");
const db = require("./db");
const path = require("path");
require("dotenv").config();

const app = express();


// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ Route Imports
const authRoutes = require("./routes/auth");
const staffRoutes = require("./routes/staff");
const productRoutes = require("./routes/products");
const dashboardRoutes = require("./routes/dashboard");
const transactionRoutes = require("./routes/transactions");
const editProductRoutes = require("./routes/editProduct");
const staffTransactionRoutes = require("./routes/staffTransaction"); // ✅ <-- Add this

// ✅ Use Routes
app.use("/api/auth", authRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/products", productRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/edit-product", editProductRoutes);
app.use("/api/staff-transaction", staffTransactionRoutes); // ✅ <-- Add this

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
