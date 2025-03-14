const express = require("express");
const cors = require("cors");
const db = require("./db"); // ✅ Database connection
const path = require("path"); // ✅ Missing import
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

// ✅ Import routes
const authRoutes = require("./routes/auth");
const staffRoutes = require("./routes/staff"); 
const productRoutes = require("./routes/products"); 
const dashboardRoutes = require("./routes/dashboard");
const transactionRoutes = require("./routes/transactions"); 
const editProductRoutes = require("./routes/editProduct"); 




// ✅ Register routes
app.use("/api/auth", authRoutes);  
app.use("/api/staff", staffRoutes);  
app.use("/api/products", productRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/edit-product", editProductRoutes);

// ✅ Serve uploaded images
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); 

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
