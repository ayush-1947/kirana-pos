// database.js — SQLite via sql.js (pure JS, no native compilation needed)
const initSqlJs = require('sql.js');
const path      = require('path');
const fs        = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'pos_data.db');

let db   = null;
let _sql = null;

// Persist DB to disk after every write
function persist() {
  const data = db.export();
  const buf  = Buffer.from(data);
  // Ensure directory exists (for Railway /data volume)
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, buf);
}

async function initDB() {
  if (db) return db;

  _sql = await initSqlJs();

  // Load existing DB file if it exists
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new _sql.Database(fileBuffer);
  } else {
    db = new _sql.Database();
  }

  createSchema();
  seedData();
  persist();
  return db;
}

function createSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode    TEXT UNIQUE NOT NULL,
      name       TEXT NOT NULL,
      price      REAL NOT NULL,
      category   TEXT DEFAULT 'General',
      stock      INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS sales (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id        TEXT UNIQUE NOT NULL,
      items_json     TEXT NOT NULL,
      subtotal       REAL NOT NULL,
      tax            REAL NOT NULL,
      total          REAL NOT NULL,
      payment_method TEXT DEFAULT 'UPI',
      created_at     TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
  `);
}

function seedData() {
  const existing = dbGet('SELECT COUNT(*) as c FROM products');
  if (existing && existing.c > 0) return;

  const samples = [
    ['8901030820015', 'Parle-G Biscuit 100g',    10,  'Biscuits',  50],
    ['8901063104013', 'Maggi Noodles 70g',        14,  'Noodles',   30],
    ['8901719110023', 'Britannia Bread 400g',     40,  'Bakery',    15],
    ['8906001800011', 'Amul Butter 100g',         55,  'Dairy',     20],
    ['8901233031236', 'Surf Excel 500g',          95,  'Detergent', 25],
    ['8901030823221', 'Hide & Seek 100g',         30,  'Biscuits',  40],
    ['8901725131042', 'Tata Salt 1kg',            24,  'Groceries', 60],
    ['8901764012345', 'Good Day Cashew 150g',     40,  'Biscuits',  35],
  ];
  samples.forEach(([barcode, name, price, category, stock]) => {
    db.run(
      `INSERT OR IGNORE INTO products (barcode,name,price,category,stock) VALUES (?,?,?,?,?)`,
      [barcode, name, price, category, stock]
    );
  });
}

// ── Query helpers that mirror better-sqlite3's API ────────────────────────────

function dbAll(sql, params = []) {
  const stmt    = db.prepare(sql);
  const rows    = [];
  stmt.bind(params);
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function dbGet(sql, params = []) {
  const rows = dbAll(sql, params);
  return rows[0] || null;
}

function dbRun(sql, params = []) {
  db.run(sql, params);
  // Return lastInsertRowid equivalent
  const row = dbGet('SELECT last_insert_rowid() as id');
  persist(); // save to disk after every write
  return { lastInsertRowid: row ? row.id : null };
}

module.exports = { initDB, dbAll, dbGet, dbRun };
