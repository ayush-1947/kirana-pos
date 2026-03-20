// server.js — Kirana POS Express Backend (sql.js edition)
const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const path       = require('path');
const { v4: uuidv4 } = require('uuid');
const { initDB, dbAll, dbGet, dbRun } = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production') {
  process.env.DB_PATH = '/data/pos_data.db';
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────

app.get('/api/products', (req, res) => {
  const { q } = req.query;
  let rows;
  if (q && q.trim()) {
    rows = dbAll(
      `SELECT * FROM products WHERE name LIKE ? OR barcode LIKE ? ORDER BY name ASC`,
      [`%${q}%`, `%${q}%`]
    );
  } else {
    rows = dbAll(`SELECT * FROM products ORDER BY name ASC`);
  }
  res.json({ success: true, products: rows });
});

app.get('/api/products/:barcode', (req, res) => {
  const row = dbGet(`SELECT * FROM products WHERE barcode = ?`, [req.params.barcode]);
  if (!row) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, product: row });
});

app.post('/api/products', (req, res) => {
  const { barcode, name, price, category = 'General', stock = 0 } = req.body;
  if (!barcode || !name || price === undefined) {
    return res.status(400).json({ success: false, message: 'barcode, name, and price are required' });
  }
  try {
    const info = dbRun(
      `INSERT INTO products (barcode,name,price,category,stock) VALUES (?,?,?,?,?)`,
      [barcode, name.trim(), parseFloat(price), category.trim() || 'General', parseInt(stock) || 0]
    );
    const created = dbGet(`SELECT * FROM products WHERE id = ?`, [info.lastInsertRowid]);
    res.status(201).json({ success: true, product: created });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ success: false, message: 'Barcode already exists' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/products/:barcode', (req, res) => {
  const existing = dbGet(`SELECT * FROM products WHERE barcode = ?`, [req.params.barcode]);
  if (!existing) return res.status(404).json({ success: false, message: 'Product not found' });
  const { name, price, category, stock } = req.body;
  dbRun(
    `UPDATE products SET name=?,price=?,category=?,stock=? WHERE barcode=?`,
    [
      name     ?? existing.name,
      price    !== undefined ? parseFloat(price) : existing.price,
      category ?? existing.category,
      stock    !== undefined ? parseInt(stock)   : existing.stock,
      req.params.barcode,
    ]
  );
  const updated = dbGet(`SELECT * FROM products WHERE barcode = ?`, [req.params.barcode]);
  res.json({ success: true, product: updated });
});

app.delete('/api/products/:barcode', (req, res) => {
  const existing = dbGet(`SELECT * FROM products WHERE barcode = ?`, [req.params.barcode]);
  if (!existing) return res.status(404).json({ success: false, message: 'Product not found' });
  dbRun(`DELETE FROM products WHERE barcode = ?`, [req.params.barcode]);
  res.json({ success: true, message: 'Product deleted' });
});

// ─── SALES ────────────────────────────────────────────────────────────────────

app.get('/api/sales', (req, res) => {
  const rows = dbAll(`SELECT * FROM sales ORDER BY created_at DESC LIMIT 100`);
  const parsed = rows.map(r => ({ ...r, items: JSON.parse(r.items_json) }));
  res.json({ success: true, sales: parsed });
});

app.post('/api/sales', (req, res) => {
  const { items, subtotal, tax, total, payment_method = 'UPI' } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'items array is required' });
  }
  const sale_id = uuidv4();
  dbRun(
    `INSERT INTO sales (sale_id,items_json,subtotal,tax,total,payment_method) VALUES (?,?,?,?,?,?)`,
    [sale_id, JSON.stringify(items), subtotal, tax, total, payment_method]
  );
  res.status(201).json({ success: true, sale_id });
});

// ─── STATS ────────────────────────────────────────────────────────────────────

app.get('/api/stats', (req, res) => {
  const productCount = dbGet(`SELECT COUNT(*) as c FROM products`);
  const salesCount   = dbGet(`SELECT COUNT(*) as c FROM sales`);
  const todaySales   = dbGet(
    `SELECT COUNT(*) as c, COALESCE(SUM(total),0) as rev FROM sales WHERE date(created_at) = date('now','localtime')`
  );
  res.json({
    success: true,
    stats: {
      total_products: productCount ? productCount.c : 0,
      total_sales:    salesCount   ? salesCount.c   : 0,
      today_sales:    todaySales   ? todaySales.c   : 0,
      today_revenue:  todaySales   ? parseFloat(todaySales.rev).toFixed(2) : '0.00',
    }
  });
});

// ─── EXPORT ───────────────────────────────────────────────────────────────────

app.get('/api/export', (req, res) => {
  const products = dbAll(`SELECT * FROM products ORDER BY name ASC`);
  const sales    = dbAll(`SELECT * FROM sales ORDER BY created_at DESC`)
    .map(r => ({ ...r, items: JSON.parse(r.items_json) }));
  const payload  = {
    exported_at: new Date().toISOString(),
    products,
    sales,
    summary: {
      total_products: products.length,
      total_sales:    sales.length,
      total_revenue:  sales.reduce((s, r) => s + r.total, 0).toFixed(2),
    }
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="pos_export_${Date.now()}.json"`);
  res.json(payload);
});

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start (must init DB first) ───────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🛒 Kirana POS running at http://localhost:${PORT}`);
    console.log(`   Database: ${process.env.DB_PATH || 'pos_data.db'}`);
    console.log(`   Press Ctrl+C to stop\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
