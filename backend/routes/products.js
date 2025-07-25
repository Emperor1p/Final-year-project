const express = require("express");
const router = express.Router();
const db = require("../db");
const upload = require("../middleware/upload");
const authMiddleware = require("../middleware/auth");
const checkPermission = require("../middleware/checkPermission");
const logAction = require("../middleware/logAction");
const crypto = require("crypto");

// GET all products (public)
router.get("/", (req, res) => {
  db.query("SELECT * FROM products", (err, result) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json(result);
  });
});

// GET all products (authenticated, requires view_products)
router.get("/all", authMiddleware, checkPermission("view_products"), (req, res) => {
  db.query("SELECT * FROM products", (err, result) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json(result);
  });
});

// GET product by ID (authenticated, requires view_products)
router.get("/:id", authMiddleware, checkPermission("view_products"), (req, res) => {
  const productId = req.params.id;
  db.query("SELECT * FROM products WHERE id = ?", [productId], (err, result) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (result.length === 0) return res.status(404).json({ message: "Product not found" });
    res.json(result[0]);
  });
});

// GET product by barcode (authenticated, requires make_sales)
router.get("/barcode/:code", authMiddleware, checkPermission("make_sales"), (req, res) => {
  const { code } = req.params;
  db.query(
    "SELECT id, name, price, stock, barcode, description, image, signature FROM products WHERE barcode = ?",
    [code],
    (err, results) => {
      if (err) {
        console.error("[Products] Error fetching product by barcode:", err);
        return res.status(500).json({ message: "Database error", error: err.message });
      }
      if (results.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(results[0]);
    }
  );
});

// VERIFY barcode
router.get("/verify", (req, res) => {
  const { barcode, signature } = req.query;
  const privateKey = process.env.PRIVATE_KEY || "your-secure-private-key";

  db.query("SELECT * FROM products WHERE barcode = ?", [barcode], (err, results) => {
    if (err) {
      console.error("[Products] Error fetching product:", err);
      return res.status(500).json({ message: "Database error" });
    }
    if (results.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const product = results[0];
    const expectedSignature = crypto
      .createHmac("sha256", privateKey)
      .update(barcode)
      .digest("hex");

    if (expectedSignature !== signature) {
      return res.status(400).json({ message: "Invalid barcode signature" });
    }

    db.query(
      "SELECT COUNT(*) as scanCount FROM scans WHERE barcode = ?",
      [barcode],
      (err, scanResults) => {
        if (err) {
          console.error("[Products] Error checking scans:", err);
          return res.status(500).json({ message: "Database error" });
        }
        if (scanResults[0].scanCount >= 1) {
          return res.status(400).json({ message: "Barcode already used" });
        }

        db.query(
          "INSERT INTO scans (barcode, signature, ip_address, device_info) VALUES (?, ?, ?, ?)",
          [barcode, signature, req.ip, req.headers["user-agent"]],
          (err) => {
            if (err) {
              console.error("[Products] Error logging scan:", err);
              return res.status(500).json({ message: "Error logging scan" });
            }
            res.json({
              message: "Valid barcode",
              product: {
                id: product.id,
                name: product.name,
                price: product.price,
                stock: product.stock,
                description: product.description,
                barcode: product.barcode,
                image: product.image,
                signature: product.signature,
              },
            });
          }
        );
      }
    );
  });
});

// DELETE product by ID (authenticated, admin only, requires edit_products)
router.delete(
  "/delete/:id",
  authMiddleware,
  checkPermission("edit_products"),
  logAction("Deleted product"),
  (req, res) => {
    const productId = req.params.id;

    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied: Admins only" });
    }

    db.query("SELECT id, created_at FROM products WHERE id = ?", [productId], (err, result) => {
      if (err) {
        console.error("[Products] Error checking product:", err);
        return res.status(500).json({ message: "Database error" });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }

      db.query(
        "INSERT INTO product_history (product_id, created_at, deleted_at) VALUES (?, ?, NOW())",
        [productId, result[0].created_at],
        (err) => {
          if (err) {
            console.error("[Products] Error logging to product_history:", err);
            return res.status(500).json({ message: "Error logging deletion" });
          }

          db.query("DELETE FROM products WHERE id = ?", [productId], (err, result) => {
            if (err) {
              console.error("[Products] Error deleting product:", err);
              return res.status(500).json({ message: "Database error while deleting product" });
            }
            res.json({ message: "Product deleted successfully" });
          });
        }
      );
    });
  }
);

// ADD product (authenticated, admin only, requires edit_products)
router.post(
  "/add",
  authMiddleware,
  checkPermission("edit_products"),
  logAction("Added product"),
  upload.single("image"),
  (req, res) => {
    const { name, stock, price, description, barcode } = req.body;
    const image = req.file ? req.file.filename : null;

    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied: Admins only" });
    }

    if (!name || !stock || !price || !description || !barcode) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const privateKey = process.env.PRIVATE_KEY || "your-secure-private-key";
    const signature = crypto.createHmac("sha256", privateKey).update(barcode).digest("hex");

    const query =
      "INSERT INTO products (name, stock, price, description, barcode, image, signature) VALUES (?, ?, ?, ?, ?, ?, ?)";
    db.query(
      query,
      [name, stock, price, description, barcode, image, signature],
      (err, result) => {
        if (err) {
          console.error("[Products] Error adding product:", err);
          return res.status(500).json({ message: "Database error while adding product." });
        }
        res.json({ message: "Product added successfully!", barcode, signature });
      }
    );
  }
);

// UPDATE product (authenticated, admin only, requires edit_products)
router.put(
  "/update/:id",
  authMiddleware,
  checkPermission("edit_products"),
  logAction("Updated product"),
  upload.single("image"),
  (req, res) => {
    const productId = req.params.id;
    const { name, stock, price, description, barcode } = req.body;
    const image = req.file ? req.file.filename : null;

    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied: Admins only" });
    }

    if (!name || !stock || !price || !description || !barcode) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const privateKey = process.env.PRIVATE_KEY || "your-secure-private-key";
    const signature = crypto.createHmac("sha256", privateKey).update(barcode).digest("hex");

    const fields = image
      ? [name, stock, price, description, barcode, signature, image, productId]
      : [name, stock, price, description, barcode, signature, productId];

    const query = image
      ? "UPDATE products SET name = ?, stock = ?, price = ?, description = ?, barcode = ?, signature = ?, image = ? WHERE id = ?"
      : "UPDATE products SET name = ?, stock = ?, price = ?, description = ?, barcode = ?, signature = ? WHERE id = ?";

    db.query(query, fields, (err) => {
      if (err) {
        console.error("[Products] Error updating product:", err);
        return res.status(500).json({ message: "Error updating product" });
      }
      res.json({ message: "Product updated successfully" });
    });
  }
);

// SELL product (authenticated, requires make_sales)
router.post(
  "/sell",
  authMiddleware,
  checkPermission("make_sales"),
  logAction("Sold product"),
  (req, res) => {
    const { productId, quantity, staffId } = req.body;

    if (!staffId || staffId != req.user.id) {
      return res.status(400).json({ message: "Invalid or missing staffId" });
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

      db.query(
        "UPDATE products SET stock = ? WHERE id = ?",
        [newStock, productId],
        (err) => {
          if (err) return res.status(500).json({ message: "Error updating stock" });

          db.query(
            "INSERT INTO transactions (product_id, user_id, quantity, total_price, sold_at) VALUES (?, ?, ?, ?, NOW())",
            [productId, staffId, quantity, totalPrice],
            (err) => {
              if (err) {
                console.error("[Products] Transaction error:", err);
                return res.status(500).json({ message: "Error recording transaction" });
              }
              res.json({ message: "Product sold successfully" });
            }
          );
        }
      );
    });
  }
);

// CHECKOUT (bulk sell, authenticated, requires make_sales)
router.post(
  "/checkout",
  authMiddleware,
  checkPermission("make_sales"),
  logAction("Checkout completed"),
  (req, res) => {
    const { items, staffId } = req.body;

    if (!staffId || staffId != req.user.id) {
      return res.status(400).json({ message: "Invalid or missing staffId" });
    }

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ message: "Invalid request format" });
    }

    console.log("[Products] Checkout started:", { staffId, items });

    db.beginTransaction((err) => {
      if (err) {
        console.error("[Products] Transaction error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      const queries = items.map(({ productId, quantity }) => {
        return new Promise((resolve, reject) => {
          db.query(
            "SELECT stock, price FROM products WHERE id = ? FOR UPDATE",
            [productId],
            (err, result) => {
              if (err) return reject(err);
              if (result.length === 0)
                return reject(new Error(`Product ID ${productId} not found`));
              const { stock, price } = result[0];
              if (stock < quantity) {
                return reject(new Error(`Not enough stock for product ID ${productId}`));
              }
              const newStock = stock - quantity;
              const totalPrice = price * quantity;
              db.query(
                "UPDATE products SET stock = ? WHERE id = ?",
                [newStock, productId],
                (err) => {
                  if (err) return reject(err);
                  db.query(
                    "INSERT INTO transactions (product_id, user_id, quantity, total_price, sold_at) VALUES (?, ?, ?, ?, NOW())",
                    [productId, staffId, quantity, totalPrice],
                    (err) => {
                      if (err) return reject(err);
                      resolve();
                    }
                  );
                }
              );
            }
          );
        });
      });

      Promise.all(queries)
        .then(() => {
          db.commit((err) => {
            if (err) {
              db.rollback(() => {});
              console.error("[Products] Commit error:", err);
              return res.status(500).json({ message: "Database error" });
            }
            console.log("[Products] Checkout successful:", { staffId, items });
            res.json({ message: "Checkout successful!" });
          });
        })
        .catch((err) => {
          db.rollback(() => {});
          console.error("[Products] Checkout error:", err.message);
          res.status(400).json({ message: err.message });
        });
    });
  }
);

module.exports = router;