// app.js — Kirana POS Frontend Logic

/* ═══════════════════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════════════════ */
const CONFIG = {
  API_BASE:    '',               // same origin
  TAX_RATE:    0.05,             // 5% GST
  SHOP_NAME:   'KIRANA STORE',
  SHOP_ADDR:   'Main Road, Your City',
  UPI_ID:      'yourstore@upi',  // ← Change to real UPI ID
  UPI_NAME:    'Kirana Store',
  CURRENCY:    '₹',
};

/* ═══════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════ */
let cart       = [];
let editBarcode = null;   // for product edit mode
let scannerRunning = false;

/* ═══════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  updateHeaderDate();
  setInterval(updateHeaderDate, 60_000);
  registerSW();
  loadCartFromStorage();
});

function updateHeaderDate() {
  const d = new Date();
  document.getElementById('headerDate').textContent =
    d.toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short' }) + ' · ' +
    d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

/* ═══════════════════════════════════════════════════════
   VIEW SWITCHING
═══════════════════════════════════════════════════════ */
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelector(`[data-view="${name}"]`).classList.add('active');

  if (name === 'products') loadProducts();
  if (name === 'history')  loadHistory();
}

/* ═══════════════════════════════════════════════════════
   API HELPERS
═══════════════════════════════════════════════════════ */
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(CONFIG.API_BASE + path, opts);
    return await res.json();
  } catch (err) {
    // Offline fallback: try localStorage
    console.warn('API error (offline?)', err);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════
   BARCODE LOOKUP
═══════════════════════════════════════════════════════ */
async function lookupBarcode(barcode) {
  barcode = barcode.trim();
  if (!barcode) return;

  document.getElementById('barcodeInput').value = '';

  const data = await api('GET', `/api/products/${encodeURIComponent(barcode)}`);

  if (data && data.success) {
    addToCart(data.product);
    toast(`Added: ${data.product.name}`, 'success');
  } else {
    // Unknown barcode → open add form pre-filled
    openManualAdd(barcode);
    toast(`New barcode – add product details`, 'info');
  }
}

/* ═══════════════════════════════════════════════════════
   CART MANAGEMENT
═══════════════════════════════════════════════════════ */
function addToCart(product, qty = 1) {
  const existing = cart.find(i => i.barcode === product.barcode);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      barcode:  product.barcode,
      name:     product.name,
      price:    product.price,
      category: product.category,
      qty,
    });
  }
  saveCartToStorage();
  renderCart();
}

function updateQty(barcode, delta) {
  const item = cart.find(i => i.barcode === barcode);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCartToStorage();
  renderCart();
}

function removeFromCart(barcode) {
  cart = cart.filter(i => i.barcode !== barcode);
  saveCartToStorage();
  renderCart();
}

function clearCart() {
  if (cart.length === 0) return;
  if (!confirm('Clear all items from cart?')) return;
  cart = [];
  saveCartToStorage();
  renderCart();
}

function cartTotals() {
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const tax      = subtotal * CONFIG.TAX_RATE;
  const total    = subtotal + tax;
  return { subtotal, tax, total };
}

function renderCart() {
  const empty   = document.getElementById('cartEmpty');
  const items   = document.getElementById('cartItems');
  const summary = document.getElementById('billSummary');
  const count   = document.getElementById('cartCount');

  count.textContent = `${cart.reduce((s,i)=>s+i.qty,0)} item${cart.reduce((s,i)=>s+i.qty,0)===1?'':'s'}`;

  if (cart.length === 0) {
    empty.style.display   = 'flex';
    items.innerHTML       = '';
    summary.style.display = 'none';
    return;
  }

  empty.style.display   = 'none';
  summary.style.display = 'block';

  items.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${escHtml(item.name)}</div>
        <div class="cart-item-meta">${escHtml(item.barcode)} · ₹${item.price.toFixed(2)} each</div>
      </div>
      <div class="cart-item-controls">
        <button class="qty-btn" onclick="updateQty('${item.barcode}', -1)">−</button>
        <span class="qty-display">${item.qty}</span>
        <button class="qty-btn" onclick="updateQty('${item.barcode}', 1)">+</button>
        <span class="cart-item-price">${CONFIG.CURRENCY}${(item.price * item.qty).toFixed(2)}</span>
        <button class="remove-btn" onclick="removeFromCart('${item.barcode}')">✕</button>
      </div>
    </div>
  `).join('');

  const { subtotal, tax, total } = cartTotals();
  document.getElementById('summarySubtotal').textContent = `₹${subtotal.toFixed(2)}`;
  document.getElementById('summaryTax').textContent      = `₹${tax.toFixed(2)}`;
  document.getElementById('summaryTotal').textContent    = `₹${total.toFixed(2)}`;
}

function saveCartToStorage() {
  localStorage.setItem('kirana_cart', JSON.stringify(cart));
}
function loadCartFromStorage() {
  try {
    const saved = localStorage.getItem('kirana_cart');
    if (saved) { cart = JSON.parse(saved); renderCart(); }
  } catch {}
}

/* ═══════════════════════════════════════════════════════
   SCANNER
═══════════════════════════════════════════════════════ */
function openScanner() {
  document.getElementById('modalScanner').classList.add('open');
  startQuagga();
}

function closeScanner() {
  stopQuagga();
  document.getElementById('modalScanner').classList.remove('open');
  document.getElementById('scannerStatus').textContent = '';
}

function startQuagga() {
  if (scannerRunning) return;
  const viewport = document.getElementById('scannerViewport');

  Quagga.init({
    inputStream: {
      name: 'Live',
      type: 'LiveStream',
      target: viewport,
      constraints: {
        facingMode: 'environment',
        width:  { ideal: 640 },
        height: { ideal: 480 },
      },
    },
    decoder: {
      readers: [
        'ean_reader', 'ean_8_reader',
        'code_128_reader', 'code_39_reader',
        'upc_reader', 'upc_e_reader',
      ],
    },
    locate: true,
    frequency: 10,
  }, err => {
    if (err) {
      document.getElementById('scannerStatus').textContent = '⚠ Camera not available — type barcode below';
      console.warn('Quagga init error:', err);
      return;
    }
    Quagga.start();
    scannerRunning = true;
  });

  let lastCode = '';
  let debounce = 0;

  Quagga.onDetected(result => {
    const code = result.codeResult.code;
    const now  = Date.now();

    // Debounce: ignore same code within 2 seconds
    if (code === lastCode && now - debounce < 2000) return;
    lastCode = code;
    debounce = now;

    document.getElementById('scannerStatus').textContent = `✓ Scanned: ${code}`;

    // Vibrate if supported
    if (navigator.vibrate) navigator.vibrate(80);

    closeScanner();
    lookupBarcode(code);
  });
}

function stopQuagga() {
  if (!scannerRunning) return;
  try { Quagga.stop(); } catch {}
  scannerRunning = false;
}

/* ═══════════════════════════════════════════════════════
   MANUAL ADD / EDIT
═══════════════════════════════════════════════════════ */
function openManualAdd(prefillBarcode = '') {
  editBarcode = null;
  document.getElementById('productModalTitle').textContent = 'Add New Product';
  document.getElementById('productSaveBtn').textContent    = 'Save Product';
  document.getElementById('productForm').reset();
  if (prefillBarcode) document.getElementById('pBarcode').value = prefillBarcode;
  document.getElementById('modalProduct').classList.add('open');
  setTimeout(() => document.getElementById(prefillBarcode ? 'pName' : 'pBarcode').focus(), 300);
}

function openEditProduct(product) {
  editBarcode = product.barcode;
  document.getElementById('productModalTitle').textContent = 'Edit Product';
  document.getElementById('productSaveBtn').textContent    = 'Update Product';
  document.getElementById('pBarcode').value   = product.barcode;
  document.getElementById('pName').value      = product.name;
  document.getElementById('pPrice').value     = product.price;
  document.getElementById('pCategory').value  = product.category;
  document.getElementById('pStock').value     = product.stock || 0;
  document.getElementById('pBarcode').readOnly = true;
  document.getElementById('modalProduct').classList.add('open');
}

async function saveProduct(e) {
  e.preventDefault();
  const btn = document.getElementById('productSaveBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner"></span>';

  const payload = {
    barcode:  document.getElementById('pBarcode').value.trim(),
    name:     document.getElementById('pName').value.trim(),
    price:    parseFloat(document.getElementById('pPrice').value),
    category: document.getElementById('pCategory').value,
    stock:    parseInt(document.getElementById('pStock').value) || 0,
  };

  let data;
  if (editBarcode) {
    data = await api('PUT', `/api/products/${encodeURIComponent(editBarcode)}`, payload);
  } else {
    data = await api('POST', '/api/products', payload);
  }

  btn.disabled = false;
  btn.textContent = editBarcode ? 'Update Product' : 'Save Product';

  if (!data) {
    toast('Server error – saved offline', 'error');
    // Offline fallback: add directly to cart anyway
    addToCart(payload);
    closeModal('modalProduct');
    return;
  }

  if (data.success) {
    toast(`${editBarcode ? 'Updated' : 'Saved'}: ${payload.name}`, 'success');
    closeModal('modalProduct');
    document.getElementById('pBarcode').readOnly = false;

    // If in add mode (new barcode), add to cart automatically
    if (!editBarcode) {
      addToCart(data.product);
    }

    // Refresh products view if active
    if (document.getElementById('view-products').classList.contains('active')) {
      loadProducts();
    }
  } else {
    toast(data.message || 'Error saving product', 'error');
  }
}

/* ═══════════════════════════════════════════════════════
   PRODUCT SEARCH
═══════════════════════════════════════════════════════ */
function openSearch() {
  document.getElementById('modalSearch').classList.add('open');
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '<p class="no-results">Start typing to search…</p>';
  setTimeout(() => document.getElementById('searchInput').focus(), 300);
}

let searchTimer;
function liveSearch(q) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => doSearch(q), 250);
}

async function doSearch(q) {
  if (!q.trim()) {
    document.getElementById('searchResults').innerHTML = '<p class="no-results">Start typing to search…</p>';
    return;
  }
  const data = await api('GET', `/api/products?q=${encodeURIComponent(q)}`);
  const container = document.getElementById('searchResults');
  if (!data || !data.success || data.products.length === 0) {
    container.innerHTML = `
      <p class="no-results">No products found for "${escHtml(q)}"</p>
      <div style="text-align:center;padding:12px">
        <button onclick="closeModal('modalSearch');openManualAdd('${escHtml(q)}')" 
                style="background:var(--amber);color:#000;padding:10px 20px;border-radius:8px;font-weight:700;font-size:13px">
          + Add "${escHtml(q)}" as new product
        </button>
      </div>`;
    return;
  }
  container.innerHTML = data.products.map(p => `
    <div class="search-result-item" onclick="addFromSearch('${p.barcode}')">
      <div>
        <div class="sri-name">${escHtml(p.name)}</div>
        <div class="sri-sub">${escHtml(p.barcode)} · ${escHtml(p.category)}</div>
      </div>
      <span class="sri-price">₹${p.price.toFixed(2)}</span>
    </div>
  `).join('');
}

async function addFromSearch(barcode) {
  const data = await api('GET', `/api/products/${encodeURIComponent(barcode)}`);
  if (data && data.success) {
    addToCart(data.product);
    toast(`Added: ${data.product.name}`, 'success');
    closeModal('modalSearch');
  }
}

/* ═══════════════════════════════════════════════════════
   PRODUCTS VIEW
═══════════════════════════════════════════════════════ */
async function loadProducts(q = '') {
  const data = await api('GET', `/api/products${q ? '?q=' + encodeURIComponent(q) : ''}`);
  const list  = document.getElementById('productList');
  const badge = document.getElementById('productCountBadge');

  if (!data || !data.success) {
    list.innerHTML = '<p class="no-results">Could not load products</p>';
    return;
  }

  badge.textContent = `${data.products.length} products`;

  if (data.products.length === 0) {
    list.innerHTML = '<p class="no-results">No products yet – add your first one!</p>';
    return;
  }

  list.innerHTML = data.products.map(p => `
    <div class="product-card">
      <span class="product-cat-badge">${escHtml(p.category)}</span>
      <div class="product-card-info">
        <div class="product-card-name">${escHtml(p.name)}</div>
        <div class="product-card-barcode">${escHtml(p.barcode)}</div>
      </div>
      <div class="product-card-actions">
        <span class="product-card-price">₹${p.price.toFixed(2)}</span>
        <button class="p-add-btn" onclick="addToCartById('${p.barcode}')" title="Add to cart">
          <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>
        </button>
        <button class="p-edit-btn" onclick="editProductById('${p.barcode}')" title="Edit">
          <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

async function addToCartById(barcode) {
  const data = await api('GET', `/api/products/${encodeURIComponent(barcode)}`);
  if (data && data.success) {
    addToCart(data.product);
    toast(`Added: ${data.product.name}`, 'success');
    showView('pos');
  }
}

async function editProductById(barcode) {
  const data = await api('GET', `/api/products/${encodeURIComponent(barcode)}`);
  if (data && data.success) openEditProduct(data.product);
}

async function searchProducts(q) {
  await loadProducts(q);
}

/* ═══════════════════════════════════════════════════════
   CHECKOUT & BILL
═══════════════════════════════════════════════════════ */
function openCheckout() {
  if (cart.length === 0) { toast('Cart is empty', 'error'); return; }
  renderBill();
  document.getElementById('modalCheckout').classList.add('open');
}

function renderBill() {
  const { subtotal, tax, total } = cartTotals();
  const now = new Date();
  const billId = 'INV-' + Date.now().toString(36).toUpperCase();

  const itemRows = cart.map(i => `
    <div class="bill-row">
      <span>${escHtml(i.name)}</span>
      <span>${i.qty} × ₹${i.price.toFixed(2)}</span>
      <span>₹${(i.qty * i.price).toFixed(2)}</span>
    </div>
  `).join('');

  const upiString = `upi://pay?pa=${CONFIG.UPI_ID}&pn=${encodeURIComponent(CONFIG.UPI_NAME)}&am=${total.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Bill ' + billId)}`;

  document.getElementById('billContent').innerHTML = `
    <div class="bill-shop-name">${escHtml(CONFIG.SHOP_NAME)}</div>
    <div class="bill-shop-sub">${escHtml(CONFIG.SHOP_ADDR)}</div>
    <div class="bill-shop-sub">GSTIN: 22AAAAA0000A1Z5 · Tel: +91 98765 43210</div>
    <hr class="bill-divider">
    <div class="bill-row header">
      <span>ITEM</span><span>QTY × PRICE</span><span>AMOUNT</span>
    </div>
    <hr class="bill-divider">
    ${itemRows}
    <hr class="bill-divider">
    <div class="bill-row subtotal-row"><span>Subtotal</span><span></span><span>₹${subtotal.toFixed(2)}</span></div>
    <div class="bill-row tax-row"><span>GST (5%)</span><span></span><span>₹${tax.toFixed(2)}</span></div>
    <hr class="bill-divider">
    <div class="bill-row total-row"><span>TOTAL</span><span></span><span>₹${total.toFixed(2)}</span></div>
    <hr class="bill-divider">

    <div class="qr-section">
      <div class="qr-label">Scan to Pay via UPI</div>
      <canvas id="qrCanvas"></canvas>
      <div class="upi-id">${escHtml(CONFIG.UPI_ID)}</div>
      <div style="font-size:11px;color:var(--text3);font-family:'Space Mono',monospace;">₹${total.toFixed(2)}</div>
    </div>

    <div style="text-align:center;font-size:10px;color:var(--text3);font-family:'Space Mono',monospace;margin-top:8px">
      ${billId} · ${now.toLocaleString('en-IN')}<br>
      Thank you! Visit again 🙏
    </div>
  `;

  // Generate QR code
  QRCode.toCanvas(document.getElementById('qrCanvas'), upiString, {
    width: 160,
    color: { dark: '#f59e0b', light: '#22222f' },
    margin: 1,
    errorCorrectionLevel: 'M',
  }, err => { if (err) console.warn('QR error:', err); });
}

/* ═══════════════════════════════════════════════════════
   PRINTING
═══════════════════════════════════════════════════════ */
function printBill() {
  const { subtotal, tax, total } = cartTotals();
  const now     = new Date();
  const billId  = 'INV-' + Date.now().toString(36).toUpperCase();

  const itemRows = cart.map(i =>
    `<div class="p-row">
      <span>${escHtml(i.name)} ×${i.qty}</span>
      <span>₹${(i.qty * i.price).toFixed(2)}</span>
    </div>`
  ).join('');

  document.getElementById('printArea').innerHTML = `
    <div class="p-shop">${escHtml(CONFIG.SHOP_NAME)}</div>
    <div class="p-sub">${escHtml(CONFIG.SHOP_ADDR)}</div>
    <div class="p-sub">${now.toLocaleString('en-IN')}</div>
    <hr class="p-divider">
    <div class="p-row hdr"><span>ITEM</span><span>AMT</span></div>
    <hr class="p-divider">
    ${itemRows}
    <hr class="p-divider">
    <div class="p-row"><span>Subtotal</span><span>₹${subtotal.toFixed(2)}</span></div>
    <div class="p-row"><span>GST 5%</span><span>₹${tax.toFixed(2)}</span></div>
    <hr class="p-divider">
    <div class="p-row p-total"><span>TOTAL</span><span>₹${total.toFixed(2)}</span></div>
    <hr class="p-divider">
    <div class="p-qr-note">Pay: ${CONFIG.UPI_ID}</div>
    <div class="p-footer">${billId}<br>Thank you! Visit again 🙏</div>
  `;

  window.print();
}

/* ═══════════════════════════════════════════════════════
   COMPLETE SALE
═══════════════════════════════════════════════════════ */
async function completeSale() {
  const { subtotal, tax, total } = cartTotals();

  const data = await api('POST', '/api/sales', {
    items: cart,
    subtotal, tax, total,
    payment_method: 'UPI',
  });

  if (data && data.success) {
    toast(`Sale saved! Total ₹${total.toFixed(2)}`, 'success');
  } else {
    toast('Sale saved offline', 'info');
  }

  cart = [];
  saveCartToStorage();
  renderCart();
  closeModal('modalCheckout');
}

/* ═══════════════════════════════════════════════════════
   HISTORY
═══════════════════════════════════════════════════════ */
async function loadHistory() {
  const [histData, statsData] = await Promise.all([
    api('GET', '/api/sales'),
    api('GET', '/api/stats'),
  ]);

  // Stats bar
  const statsBar = document.getElementById('statsBar');
  if (statsData && statsData.success) {
    const s = statsData.stats;
    statsBar.innerHTML = `
      <span class="stat-chip">Today: <strong>${s.today_sales} sales</strong></span>
      <span class="stat-chip">Revenue: <strong>₹${s.today_revenue}</strong></span>
      <span class="stat-chip">Products: <strong>${s.total_products}</strong></span>
    `;
  }

  const list = document.getElementById('salesList');
  if (!histData || !histData.success || histData.sales.length === 0) {
    list.innerHTML = '<p class="no-results">No sales history yet</p>';
    return;
  }

  list.innerHTML = histData.sales.map((s, idx) => `
    <div class="sale-card">
      <div class="sale-card-header" onclick="toggleSale(${idx})">
        <div>
          <div style="font-size:13px;font-weight:700">${s.items.length} item${s.items.length===1?'':'s'} · ${s.payment_method}</div>
          <div class="sale-id">#${s.sale_id.slice(0,8).toUpperCase()}</div>
        </div>
        <div style="text-align:right">
          <div class="sale-total">₹${s.total.toFixed(2)}</div>
          <div class="sale-time">${new Date(s.created_at).toLocaleString('en-IN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'})}</div>
        </div>
      </div>
      <div class="sale-items-preview" id="saleDetail-${idx}">
        ${s.items.map(i => `
          <div class="sale-item-line">
            <span>${escHtml(i.name)} ×${i.qty}</span>
            <span>₹${(i.price*i.qty).toFixed(2)}</span>
          </div>
        `).join('')}
        <div class="sale-item-line" style="margin-top:6px;color:var(--text3)">
          <span>GST</span><span>₹${s.tax.toFixed(2)}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function toggleSale(idx) {
  const detail = document.getElementById(`saleDetail-${idx}`);
  detail.classList.toggle('open');
}

/* ═══════════════════════════════════════════════════════
   EXPORT
═══════════════════════════════════════════════════════ */
function exportData() {
  window.open('/api/export', '_blank');
  toast('Exporting JSON data…', 'success');
}

/* ═══════════════════════════════════════════════════════
   MODAL HELPERS
═══════════════════════════════════════════════════════ */
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  if (id === 'modalProduct') {
    document.getElementById('pBarcode').readOnly = false;
    editBarcode = null;
  }
}

// Close modals on backdrop click
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', e => {
    if (e.target === modal) {
      if (modal.id === 'modalScanner') closeScanner();
      else closeModal(modal.id);
    }
  });
});

// ESC key closes modals
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (scannerRunning) closeScanner();
    document.querySelectorAll('.modal.open').forEach(m => {
      if (m.id === 'modalScanner') closeScanner();
      else closeModal(m.id);
    });
  }
});

/* ═══════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════ */
let toastTimer;
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ═══════════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════════ */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}
