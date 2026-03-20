# 🛒 Kirana POS — Point of Sale System

A fast, mobile-friendly POS system for kirana/small shops with barcode scanning,
cart management, thermal printing, and UPI QR payment.

---

## 📁 Folder Structure

```
pos-app/
├── server.js           # Express backend (API + static serving)
├── database.js         # SQLite setup, schema, seed data
├── package.json        # Node dependencies
├── pos_data.db         # SQLite database (auto-created on first run)
└── public/
    ├── index.html      # Main SPA HTML
    ├── style.css       # Full styling (dark industrial theme)
    ├── app.js          # All frontend JS logic
    ├── manifest.json   # PWA manifest
    ├── sw.js           # Service worker (offline support)
    └── icons/          # App icons (add your own 192×192 and 512×512 PNGs)
```

---

## ⚡ Quick Start

### 1. Prerequisites
- **Node.js** v18+ → https://nodejs.org/
- **npm** (comes with Node)

### 2. Install Dependencies
```bash
cd pos-app
npm install
```

### 3. Configure (Optional)
Edit `public/app.js` top section:
```js
const CONFIG = {
  SHOP_NAME: 'YOUR SHOP NAME',
  SHOP_ADDR: 'Your Address, City',
  UPI_ID:    'yourname@upi',       // ← Your real UPI ID
  UPI_NAME:  'Your Shop Name',
};
```

### 4. Run
```bash
npm start
# Server starts at http://localhost:3000
```

For development with auto-restart:
```bash
npm run dev   # requires: npm install -D nodemon
```

### 5. Open in Browser
- **Desktop:** http://localhost:3000
- **Mobile (same WiFi):** http://YOUR_PC_IP:3000

---

## 📱 Install as PWA (Mobile)

1. Open http://YOUR_PC_IP:3000 in Chrome/Safari on mobile
2. Tap the **"Add to Home Screen"** banner (or browser menu)
3. App installs with full-screen, offline-capable experience

---

## 🔧 Features

| Feature | Details |
|---|---|
| **Barcode Scanning** | Uses device camera via QuaggaJS (EAN-13, EAN-8, Code128, UPC, etc.) |
| **Manual Barcode Entry** | Type barcode → auto-lookup or new product form |
| **Product Search** | Search by name or barcode from POS or Products tab |
| **Cart Management** | Add/remove/update qty, live totals with 5% GST |
| **Bill Generation** | Clean bill UI with all line items and totals |
| **UPI QR Payment** | Auto-generates QR for UPI payment (amount embedded) |
| **Thermal Printing** | Browser print with 58/80mm thermal CSS layout |
| **Product Catalogue** | View/edit all products, add from catalogue to cart |
| **Sales History** | View past bills with expandable item details |
| **JSON Export** | Download all products + sales as JSON file |
| **PWA / Offline** | Installable, works offline (cart + cached UI) |

---

## 🗄️ SQLite Database

The database file `pos_data.db` is auto-created on first run.

### Products Table
```sql
CREATE TABLE products (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode    TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  price      REAL NOT NULL,
  category   TEXT DEFAULT 'General',
  stock      INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
```

### Sales Table
```sql
CREATE TABLE sales (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id        TEXT UNIQUE NOT NULL,
  items_json     TEXT NOT NULL,
  subtotal       REAL NOT NULL,
  tax            REAL NOT NULL,
  total          REAL NOT NULL,
  payment_method TEXT DEFAULT 'UPI',
  created_at     TEXT DEFAULT (datetime('now','localtime'))
);
```

---

## 🌐 API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/products` | List all products |
| GET | `/api/products?q=text` | Search products |
| GET | `/api/products/:barcode` | Get product by barcode |
| POST | `/api/products` | Create new product |
| PUT | `/api/products/:barcode` | Update product |
| DELETE | `/api/products/:barcode` | Delete product |
| GET | `/api/sales` | Get sales history |
| POST | `/api/sales` | Save completed sale |
| GET | `/api/stats` | Dashboard stats |
| GET | `/api/export` | Export all data as JSON |

---

## 🧾 Thermal Printer Setup

The app generates print-friendly output. To use with a thermal printer:

1. Connect thermal printer (USB/Bluetooth) to your device
2. Set it as the **default printer** in OS settings
3. Click **"Print Bill"** in the checkout screen
4. In browser print dialog:
   - Set paper size to **58mm** or **80mm**
   - Disable headers/footers
   - Set margins to **None**

### Bluetooth Thermal Printer (Mobile)
For direct mobile printing, you can extend this with:
- [ThermalPrinter.js](https://github.com/xnought/thermalprinter) 
- ESC/POS commands via Web Bluetooth API

---

## 📤 Data Export / Sync

**Export to JSON:**
- Go to **Products** tab → click **Export JSON**
- Downloads a complete `pos_export_TIMESTAMP.json` with all products + sales

**JSON Format:**
```json
{
  "exported_at": "2024-01-15T10:30:00.000Z",
  "summary": { "total_products": 8, "total_sales": 24, "total_revenue": "4820.00" },
  "products": [...],
  "sales": [...]
}
```

**Future sync options:**
- Firebase Firestore (real-time cloud sync)
- REST API to central server (multi-device sync)
- Google Sheets via Apps Script

---

## 🌱 Sample Data (Pre-loaded)

The app seeds 8 example products on first run:

| Barcode | Product | Price | Category |
|---|---|---|---|
| 8901030820015 | Parle-G Biscuit 100g | ₹10 | Biscuits |
| 8901063104013 | Maggi Noodles 70g | ₹14 | Noodles |
| 8901719110023 | Britannia Bread 400g | ₹40 | Bakery |
| 8906001800011 | Amul Butter 100g | ₹55 | Dairy |
| 8901233031236 | Surf Excel 500g | ₹95 | Detergent |
| 8901030823221 | Hide & Seek 100g | ₹30 | Biscuits |
| 8901725131042 | Tata Salt 1kg | ₹24 | Groceries |
| 8901764012345 | Good Day Cashew 150g | ₹40 | Biscuits |

---

## 🔒 Security Notes

- This is a **local prototype** — no authentication
- For production, add:
  - Login/PIN screen
  - HTTPS (use nginx + Let's Encrypt)
  - Input validation/sanitization (basic XSS escaping is included)
  - Rate limiting

---

## 🚀 Future Improvements

- [ ] Multi-user support with roles (admin/cashier)
- [ ] Stock management & low-stock alerts
- [ ] Customer database with purchase history
- [ ] GST-compliant invoice generation (PDF)
- [ ] Cloud backup (Firebase/AWS)
- [ ] Direct ESC/POS thermal printing
- [ ] Daily/weekly sales reports
- [ ] Discount & coupon system
- [ ] WhatsApp bill sharing

---

## 📄 License

MIT — Free to use and modify for your shop.
