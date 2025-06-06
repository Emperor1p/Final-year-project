const express = require("express");
const db = require("../db");
const router = express.Router();
const upload = require("../middleware/upload");
const authMiddleware = require("../middleware/auth"); // Import authMiddleware

// GET all products
router.get("/", (req, res) => {
  db.query("SELECT * FROM products", (err, result) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json(result);
  });
});

router.get("/all", (req, res) => {
  db.query("SELECT * FROM products", (err, result) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json(result);
  });
});

// GET product by ID
router.get("/:id", (req, res) => {
  const productId = req.params.id;
  db.query("SELECT * FROM products WHERE id = ?", [productId], (err, result) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (result.length === 0) return res.status(404).json({ message: "Product not found" });
    res.json(result[0]);
  });
});

// DELETE product by ID
router.delete("/delete/:id", (req, res) => {
  const productId = req.params.id;
  db.query("DELETE FROM products WHERE id = ?", [productId], (err, result) => {
    if (err) {
      console.error("Error deleting product:", err);
      return res.status(500).json({ message: "Database error while deleting product" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json({ message: "Product deleted successfully" });
  });
});

// ADD product (with image upload)
router.post("/add", upload.single("image"), (req, res) => {
  const { name, stock, price, description, barcode } = req.body;
  const image = req.file ? req.file.filename : null;

  if (!name || !stock || !price || !description || !barcode) {
    return res.status(400).json({ message: "All fields are required." });
  }

  const query = "INSERT INTO products (name, stock, price, description, barcode, image) VALUES (?, ?, ?, ?, ?, ?)";
  db.query(query, [name, stock, price, description, barcode, image], (err, result) => {
    if (err) {
      console.error("Error adding product:", err);
      return res.status(500).json({ message: "Database error while adding product." });
    }
    res.json({ message: "Product added successfully!" });
  });
});

// UPDATE product (with optional image upload)
router.put("/update/:id", upload.single("image"), (req, res) => {
  const productId = req.params.id;
  const { name, stock, price, description } = req.body;
  const image = req.file ? req.file.filename : null;

  const fields = image
    ? [name, stock, price, description, image, productId]
    : [name, stock, price, description, productId];

  const query = image
    ? "UPDATE products SET name = ?, stock = ?, price = ?, description = ?, image = ? WHERE id = ?"
    : "UPDATE products SET name = ?, stock = ?, price = ?, description = ? WHERE id = ?";

  db.query(query, fields, (err, result) => {
    if (err) return res.status(500).json({ message: "Error updating product" });
    res.json({ message: "Product updated successfully" });
  });
});

// SELL product
router.post("/sell", (req, res) => {
  const { productId, quantity, staffId } = req.body;

  if (!staffId) {
    return res.status(400).json({ message: "Missing staffId (user_id)" });
  }

  db.query("SELECT * FROM products WHERE id = ?", [productId], (err, result) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (result.length === 0) return res.status(404).json({ message: "Product not found" });

    const product = result[0];
    if (product.stock < quantity) {
      return res.status(400).json({ message: "Insufficient stock" });
    }

    const newStock = product.stock - quantity;
    const totalPrice = product.price * quantity;

    db.query("UPDATE products SET stock = ? WHERE id = ?", [newStock, productId], (err) => {
      if (err) return res.status(500).json({ message: "Error updating stock" });

      db.query(
        "INSERT INTO transactions (product_id, user_id, quantity, total_price, sold_at) VALUES (?, ?, ?, ?, NOW())",
        [productId, staffId, quantity, totalPrice],
        (err) => {
          if (err) {
            console.error("Transaction error:", err);
            return res.status(500).json({ message: "Error recording transaction" });
          }
          res.json({ message: "Product sold successfully" });
        }
      );
    });
  });
});

// GET product by barcode
router.get("/barcode/:code", authMiddleware, (req, res) => {
  const { code } = req.params;
  db.query(
    "SELECT id, name, price, stock, barcode FROM products WHERE barcode = ?",
    [code],
    (err, results) => {
      if (err) {
        return res.status(500).json({ message: "Database error", error: err });
      }
      if (results.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(results[0]);
    }
  );
});

// CHECKOUT (bulk sell)
router.post("/checkout", (req, res) => {
  const { items, staffId } = req.body;

  if (!staffId) {
    return res.status(400).json({ message: "Missing staffId (user_id)" });
  }

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ message: "Invalid request format" });
  }

  let processed = 0;
  let hasError = false;

  items.forEach((item) => {
    const { productId, quantity } = item;

    db.query("SELECT * FROM products WHERE id = ?", [productId], (err, result) => {
      if (hasError) return;
      if (err) {
        hasError = true;
        return res.status(500).json({ message: "Database error while fetching product" });
      }

      if (!result || result.length === 0) {
        hasError = true;
        return res.status(404).json({ message: `Product ID ${productId} not found` });
      }

      const product = result[0];

      if (product.stock < quantity) {
        hasError = true;
        return res.status(400).json({ message: `Not enough stock for product ID ${productId}` });
      }

      const newStock = product.stock - quantity;
      const totalPrice = product.price * quantity;

      db.query("UPDATE products SET stock = ? WHERE id = ?", [newStock, productId], (err) => {
        if (hasError) return;
        if (err) {
          hasError = true;
          return res.status(500).json({ message: "Error updating stock" });
        }

        db.query(
          "INSERT INTO transactions (product_id, user_id, quantity, total_price, sold_at) VALUES (?, ?, ?, ?, NOW())",
          [productId, staffId, quantity, totalPrice],
          (err) => {
            if (hasError) return;
            if (err) {
              console.error("Transaction error:", err);
              hasError = true;
              return res.status(500).json({ message: "Error recording transaction" });
            }

            processed++;
            if (processed === items.length) {
              res.json({ message: "Checkout successful!" });
            }
          }
        );
      });
    });
  });
});

module.exports = router;