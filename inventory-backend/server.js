const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 5000);
const databaseName = process.env.DB_NAME || "inventory_db";
const databaseConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true
};

app.use(cors());
app.use(express.json());

const db = mysql.createPool({
  ...databaseConfig,
  database: databaseName
});

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function validateProduct(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const price = Number(body.price);
  const stock = Number(body.stock);

  if (!name || !category || body.price === "" || body.price == null ||
      body.stock === "" || body.stock == null) {
    return { error: "Name, category, price and stock are required." };
  }

  if (name.length > 150 || category.length > 100) {
    return { error: "Name must be at most 150 characters and category at most 100." };
  }

  if (!Number.isFinite(price) || price < 0 || price > 99999999.99 ||
      !Number.isInteger(stock) || stock < 0 || stock > 2147483647) {
    return { error: "Price and stock must be valid non-negative numbers." };
  }

  return { name, category, price, stock };
}

function parseProductId(rawId) {
  const id = Number(rawId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function getCategoryId(name) {
  const [rows] = await db.execute(
    "SELECT id FROM categories WHERE name = ? LIMIT 1",
    [name]
  );

  if (rows.length > 0) return rows[0].id;

  const [result] = await db.execute(
    "INSERT INTO categories (name) VALUES (?)",
    [name]
  );
  return result.insertId;
}

app.get("/", (req, res) => {
  res.send("Inventory Management Backend is running!");
});

app.get("/api/health", asyncRoute(async (req, res) => {
  await db.query("SELECT 1");
  res.json({ status: "ok", database: databaseName });
}));

app.get("/api/products", asyncRoute(async (req, res) => {
  const [products] = await db.query(`
    SELECT
      p.id,
      p.sku,
      p.name,
      c.name AS category,
      p.unit_price AS price,
      p.current_stock AS stock,
      p.reorder_level
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ORDER BY p.id DESC
  `);
  res.json(products);
}));

app.post("/api/products", asyncRoute(async (req, res) => {
  const product = validateProduct(req.body);
  if (product.error) return res.status(400).json({ error: product.error });

  const categoryId = await getCategoryId(product.category);
  const sku = `SKU-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const [result] = await db.execute(
    `INSERT INTO products
      (sku, name, category_id, unit_price, current_stock, reorder_level)
     VALUES (?, ?, ?, ?, ?, 5)`,
    [sku, product.name, categoryId, product.price, product.stock]
  );

  res.status(201).json({ id: result.insertId, sku, ...product });
}));

app.put("/api/products/:id", asyncRoute(async (req, res) => {
  const id = parseProductId(req.params.id);
  if (!id) return res.status(400).json({ error: "Product ID must be a positive integer." });

  const product = validateProduct(req.body);
  if (product.error) return res.status(400).json({ error: product.error });

  const [existing] = await db.execute(
    "SELECT id FROM products WHERE id = ?",
    [id]
  );
  if (existing.length === 0) {
    return res.status(404).json({ error: "Product not found." });
  }

  const categoryId = await getCategoryId(product.category);
  await db.execute(
    `UPDATE products
     SET name = ?, category_id = ?, unit_price = ?, current_stock = ?
     WHERE id = ?`,
    [product.name, categoryId, product.price, product.stock, id]
  );

  res.json({ id, ...product });
}));

app.delete("/api/products/:id", asyncRoute(async (req, res) => {
  const id = parseProductId(req.params.id);
  if (!id) return res.status(400).json({ error: "Product ID must be a positive integer." });

  const [result] = await db.execute(
    "DELETE FROM products WHERE id = ?",
    [id]
  );
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: "Product not found." });
  }

  res.status(204).end();
}));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error("Inventory API request failed:", error);
  const status = Number.isInteger(error.status) ? error.status : 500;
  res.status(status).json({
    error: status < 500 ? "Invalid request." : "The inventory database request failed."
  });
});

async function startServer() {
  if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error("DB_NAME may contain only letters, numbers and underscores.");
  }

  const bootstrap = mysql.createPool(databaseConfig);
  try {
    await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``);
  } finally {
    await bootstrap.end();
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE
    ) ENGINE=InnoDB
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      sku VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(150) NOT NULL,
      category_id INT NOT NULL,
      unit_price DECIMAL(10, 2) NOT NULL,
      current_stock INT NOT NULL DEFAULT 0,
      reorder_level INT NOT NULL DEFAULT 5,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_products_category
        FOREIGN KEY (category_id) REFERENCES categories(id)
    ) ENGINE=InnoDB
  `);
  await db.query("SELECT 1");

  app.listen(port, () => {
    console.log(`Inventory backend running at http://localhost:${port}`);
    console.log(`Connected to MySQL database "${databaseName}".`);
  });
}

startServer().catch(error => {
  console.error("Could not start inventory backend:", error);
  process.exitCode = 1;
});
