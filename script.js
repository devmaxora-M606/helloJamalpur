'use strict';
const DB_NAME = 'inventory_pro_db',
    DB_VERSION = 1;
let db, state = {
        brands: [],
        products: [],
        customers: [],
        purchases: [],
        sales: [],
        notifications: [],
        settings: {
            businessName: 'Hello Jamalpur',
            currency: '৳',
            invoicePrefix: 'INV',
            lowStock: 5,
            phone: '',
            address: ''
        }
    },
    page = 'dashboard',
    currentBrand = null,
    charts = [];
const $ = id => document.getElementById(id),
    money = n => (state.settings.currency || '৳') + Number(n || 0).toLocaleString('en-BD', {
        maximumFractionDigits: 2
    }),
    uid = p => p + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
    now = () => new Date().toISOString(),
    day = d => new Date(d).toISOString().slice(0, 10),
    esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    } [c]));
const stores = ['brands', 'products', 'customers', 'purchases', 'sales', 'notifications', 'settings'];

function openDB() {
    return new Promise((resolve, reject) => {
        let r = indexedDB.open(DB_NAME, DB_VERSION);
        r.onupgradeneeded = () => {
            let d = r.result;
            stores.forEach(s => {
                if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, {
                    keyPath: 'id'
                })
            })
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error)
    })
}

function all(s) {
    return new Promise((res, rej) => {
        let r = db.transaction(s).objectStore(s).getAll();
        r.onsuccess = () => res(r.result || []);
        r.onerror = () => rej(r.error)
    })
}

function put(s, o) {
    return new Promise((res, rej) => {
        let t = db.transaction(s, 'readwrite');
        t.objectStore(s).put(o);
        t.oncomplete = () => res(o);
        t.onerror = () => rej(t.error)
    })
}

function del(s, k) {
    return new Promise((res, rej) => {
        let t = db.transaction(s, 'readwrite');
        t.objectStore(s).delete(k);
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error)
    })
}
async function load() {
    for (let s of stores) state[s] = await all(s);
    if (!state.settings.length) state.settings = {
        businessName: 'Hello Jamalpur',
        currency: '৳',
        invoicePrefix: 'INV',
        lowStock: 5
    };
    else state.settings = state.settings[0]
}
async function saveSettings() {
    await put('settings', {
        id: 'main',
        ...state.settings
    })
}

function toast(m) {
    let t = $('toast');
    t.textContent = m;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2600)
}

function brandName(id) {
    return state.brands.find(b => b.id === id)?.name || 'Archived brand'
}

function productsFor(id) {
    return state.products.filter(p => p.brandId === id)
}

function productCalc(p) {
    return {
        unit: p.MRP - p.rp,
        stock: p.rp * p.qty,
        expected: (p.MRP - p.rp) * p.qty
    }
}

function notify(title, desc, type = 'info', extra = {}) {
    let n = {
        id: uid('NTF'),
        title,
        desc,
        type,
        createdAt: now(),
        read: false,
        ...extra
    };
    state.notifications.unshift(n);
    put('notifications', n).then(updateUnread).catch(() => toast('Could not save notification'))
}

function updateUnread() {
    let n = state.notifications.filter(x => !x.read).length;
    ['topunread', 'mobileunread', 'sideunread'].forEach(k => {
        let e = $(k);
        if (e) {
            e.textContent = n;
            e.style.display = n ? '' : 'none'
        }
    })
}

function stats() {
    let today = day(now()),
        ss = state.sales.filter(s => day(s.createdAt) === today),
        p = state.products;
    return {
        rp: p.reduce((a, x) => a + x.rp * x.qty, 0),
        MRP: p.reduce((a, x) => a + x.MRP * x.qty, 0),
        profit: p.reduce((a, x) => a + (x.MRP - x.rp) * x.qty, 0),
        qty: p.reduce((a, x) => a + x.qty, 0),
        low: p.filter(x => x.qty > 0 && x.qty <= x.minStock).length,
        out: p.filter(x => x.qty === 0).length,
        todaySales: ss.reduce((a, x) => a + x.total, 0),
        todayProfit: ss.reduce((a, x) => a + x.profit, 0)
    }
}

function go(p) {
    page = p;
    currentBrand = null;
    render();
    document.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === p));
    scrollTo(0, 0)
}

function setTitle(t, s) {
    $('pagetitle').textContent = t;
    $('pagesub').textContent = s
}

function render() {
    charts.forEach(c => {
        try {
            c.destroy()
        } catch (e) {}
    });
    charts = [];
    updateUnread();
    let v = $('view');
    ({
        dashboard,
        brands: brandsPage,
        brand: brandPage,
        customers: customersPage,
        history: historyPage,
        notifications: notificationsPage,
        reports: reportsPage,
        settings: settingsPage
    } [page] || dashboard)(v);
    if (window.lucide) lucide.createIcons()
}

function statCard(label, value, icon, foot = '', color = '') {
    return `<div class="card"><div class="stathead">${label}<span class="staticon"><i data-lucide="${icon}"></i></span></div><div class="statvalue ${color}">${value}</div><div class="statfoot">${foot}</div></div>`
}

function dashboard(v) {
    setTitle('Dashboard', 'Your business at a glance');
    let s = stats();
    v.innerHTML = `<div class="grid stats">${statCard('Stock Value · RP',money(s.rp),'wallet','Current inventory cost')}${statCard('Selling Value · MRP',money(s.MRP),'badge-dollar-sign','Potential stock revenue')}${statCard('Expected Stock Profit',money(s.profit),'trending-up','Unsold inventory estimate','green')}${statCard('Sales Today',money(s.todaySales),'shopping-bag','Today revenue','blue')}${statCard('Profit Today',money(s.todayProfit),'chart-no-axes-combined','Realized profit','green')}${statCard('Products',state.products.length,'package','Unique product variants')}${statCard('Available Units',s.qty,'boxes','Current stock')}${statCard('Customers',state.customers.length,'users','Registered customers')}${statCard('Low Stock',s.low,'alert-triangle','At or below minimum','red')}${statCard('Out of Stock',s.out,'package-x','Zero available units','red')}</div><div class="sectionhead"><h2>Quick actions</h2></div><div class="quick"><button class="btn primary" onclick="receiveForm()"><i data-lucide="package-plus"></i>Receive Stock</button><button class="btn primary" onclick="saleForm()"><i data-lucide="shopping-cart"></i>Sell Products</button><button class="btn" onclick="customerForm()"><i data-lucide="user-plus"></i>Add Customer</button><button class="btn" onclick="brandForm()"><i data-lucide="plus"></i>Add Brand</button></div><div class="grid two" style="margin-top:20px"><div class="card"><div class="sectionhead" style="margin-top:0"><h2>Recent sales</h2><button class="btn small" onclick="go('history')">All transactions</button></div>${state.sales.length?state.sales.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,6).map(s=>`<div class="notice"><div class="dot"></div><div style="flex:1"><b>${esc(s.ref)}</b><div class="muted">${esc(s.customerName)} · ${money(s.total)}</div></div><button class="btn small" onclick="downloadInvoicePDF('${s.id}')">PDF</button></div>`).join(''):'<div class="empty">No sales recorded yet.</div>'}</div><div class="card"><h3 style="margin-top:0">Stock alerts</h3>${state.products.filter(p=>p.qty<=p.minStock).slice(0,8).map(p=>`<div class="notice"><div class="dot" style="background:${p.qty?'#d89a37':'#e05252'}"></div><div><b>${esc(p.model)} · ${esc(p.variant)}</b><div class="muted">${esc(brandName(p.brandId))} · ${p.qty} left</div></div></div>`).join('')||'<div class="empty">No stock alerts. Everything looks good.</div>'}</div></div>`
}

function brandsPage(v) {
    setTitle('Brand stock sheets', 'Manage independent inventory by brand');
    v.innerHTML = `<div class="toolbar"><input class="search" id="brandsearch" placeholder="Search brands..." oninput="filterBrands()"><button class="btn primary" onclick="brandForm()">＋ Add Brand</button></div><div class="grid brandgrid" id="brandgrid"></div>`;
    filterBrands()
}

function filterBrands() {
    let q = ($('brandsearch')?.value || '').toLowerCase(),
        arr = state.brands.filter(b => b.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    $('brandgrid').innerHTML = arr.length ? arr.map(b => {
        let ps = productsFor(b.id);
        return `<div class="card brandcard" onclick="openBrand('${b.id}')"><div class="rowflex"><div class="brandletter">${esc(b.name[0].toUpperCase())}</div><button class="iconbtn" onclick="event.stopPropagation();brandForm('${b.id}')"><i data-lucide="pencil"></i></button></div><h3>${esc(b.name)}</h3><p>${ps.length} models · ${ps.reduce((a,p)=>a+p.qty,0)} units</p></div>`
    }).join('') : '<div class="card empty">No brands yet. Add your first brand.</div>';
    lucide.createIcons()
}

function openBrand(id) {
    currentBrand = id;
    page = 'brand';
    render()
}

function brandPage(v) {
    let b = state.brands.find(x => x.id === currentBrand);
    if (!b) {
        go('brands');
        return
    }
    let ps = productsFor(b.id),
        qty = ps.reduce((a, p) => a + p.qty, 0),
        rp = ps.reduce((a, p) => a + p.rp * p.qty, 0),
        MRP = ps.reduce((a, p) => a + p.MRP * p.qty, 0);
    setTitle(b.name + ' Stock Sheet', 'Brand inventory and product performance');
    v.innerHTML = `<div class="toolbar"><button class="btn" onclick="go('brands')">← All Brands</button><button class="btn primary" onclick="productForm('${b.id}')">＋ Add Product</button><button class="btn" onclick="receiveForm('${b.id}')">Receive Stock</button><button class="btn" onclick="exportBrandCSV('${b.id}')">Export CSV</button><button class="btn primary" onclick="downloadBrandPDF('${b.id}')"><i data-lucide="file-down"></i>Download Stock PDF</button><button class="btn" onclick="printBrand('${b.id}')">Print</button></div><div class="grid stats" style="grid-template-columns:repeat(5,1fr)">${statCard('Models',ps.length,'package')}${statCard('Quantity',qty,'boxes')}${statCard('RP Stock Value',money(rp),'wallet')}${statCard('MRP Stock Value',money(MRP),'badge-dollar-sign')}${statCard('Expected Profit',money(MRP-rp),'trending-up','','green')}</div><div class="card"><div class="toolbar"><input class="search" id="productsearch" placeholder="Search model or variant..." oninput="filterProducts()"><select id="sortproducts" class="search" onchange="filterProducts()"><option value="model">Sort: Model</option><option value="qty">Quantity</option><option value="rp">RP Price</option><option value="MRP">MRP Price</option><option value="profit">Unit Profit</option></select><button class="btn small" onclick="downloadBrandPDF('${b.id}')">PDF</button><button class="btn small" onclick="importCSV('${b.id}')">Import CSV</button></div><div class="tablewrap"><table><thead><tr><th>Model</th><th>Variant</th><th>Qty</th><th>RP</th><th>MRP</th><th>Unit Profit</th><th>Stock Value</th><th>Expected Profit</th><th>Actions</th></tr></thead><tbody id="productrows"></tbody></table></div></div>`;
    filterProducts()
}

function filterProducts() {
    if (!$('productrows')) return;
    let q = ($('productsearch')?.value || '').toLowerCase(),
        sort = $('sortproducts')?.value || 'model',
        ps = productsFor(currentBrand).filter(p => (p.model + ' ' + p.variant).toLowerCase().includes(q));
    ps.sort((a, b) => sort === 'model' ? a.model.localeCompare(b.model) : sort === 'qty' ? b.qty - a.qty : sort === 'rp' ? b.rp - a.rp : sort === 'MRP' ? b.MRP - a.MRP : (b.MRP - b.rp) - (a.MRP - a.rp));
    $('productrows').innerHTML = ps.map(p => {
        let c = productCalc(p);
        return `<tr><td>${esc(p.model)}</td><td>${esc(p.variant)}</td><td>${p.qty}</td><td>${money(p.rp)}</td><td>${money(p.MRP)}</td><td class="${c.unit>=0?'green':'red'}">${money(c.unit)}</td><td>${money(c.stock)}</td><td class="${c.expected>=0?'green':'red'}">${money(c.expected)}</td><td><button class="btn small" onclick="productForm('${p.brandId}','${p.id}')">Edit</button> <button class="btn small" onclick="duplicateProduct('${p.id}')">Copy</button> <button class="btn small danger" onclick="deleteProduct('${p.id}')">Delete</button></td></tr>`
    }).join('') || '<tr><td colspan="9" class="empty">No products found</td></tr>'
}

function customersPage(v) {
    setTitle('Customers', 'Customer directory and account balances');
    v.innerHTML = `<div class="toolbar"><input class="search" id="custsearch" placeholder="Search name or phone..." oninput="filterCustomers()"><button class="btn primary" onclick="customerForm()">＋ Add Customer</button></div><div class="card"><div class="tablewrap"><table><thead><tr><th>Customer</th><th>Mobile</th><th>Total Purchase</th><th>Paid</th><th>Due</th><th>Actions</th></tr></thead><tbody id="customerrows"></tbody></table></div></div>`;
    filterCustomers()
}

function customerTotals(cid) {
    let ss = state.sales.filter(s => s.customerId === cid);
    return {
        total: ss.reduce((a, s) => a + s.total, 0),
        paid: ss.reduce((a, s) => a + s.paid, 0),
        due: ss.reduce((a, s) => a + s.due, 0)
    }
}

function filterCustomers() {
    if (!$('customerrows')) return;
    let q = ($('custsearch')?.value || '').toLowerCase();
    let cs = state.customers.filter(c => (c.name + c.phone + c.customerId).toLowerCase().includes(q));
    $('customerrows').innerHTML = cs.map(c => {
        let t = customerTotals(c.id);
        return `<tr><td><b>${esc(c.name)}</b><div class="muted">${esc(c.customerId)}</div></td><td>${esc(c.phone)}</td><td>${money(t.total)}</td><td class="green">${money(t.paid)}</td><td class="${t.due?'red':''}">${money(t.due)}</td><td><button class="btn small" onclick="customerProfile('${c.id}')">View</button> <button class="btn small" onclick="customerForm('${c.id}')">Edit</button></td></tr>`
    }).join('') || '<tr><td colspan="6" class="empty">No customers found</td></tr>'
}

function historyPage(v) {
    setTitle('Transactions', 'Sales and stock receiving history');
    v.innerHTML = `<div class="toolbar"><select id="histtype" class="search" onchange="filterHistory()"><option value="all">All transactions</option><option value="sale">Sales</option><option value="purchase">Stock received</option></select><input class="search" id="histsearch" placeholder="Search reference or customer..." oninput="filterHistory()"></div><div class="card"><div class="tablewrap"><table><thead><tr><th>Type</th><th>Reference</th><th>Details</th><th>Date</th><th>Amount</th><th>Actions</th></tr></thead><tbody id="historyrows"></tbody></table></div></div>`;
    filterHistory()
}

function filterHistory() {
    if (!$('historyrows')) return;
    let typ = $('histtype').value,
        q = $('histsearch').value.toLowerCase(),
        arr = [...state.sales.map(x => ({
            ...x,
            type: 'sale'
        })), ...state.purchases.map(x => ({
            ...x,
            type: 'purchase'
        }))].filter(x => typ === 'all' || x.type === typ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).filter(x => (x.ref || '').toLowerCase().includes(q) || (x.customerName || x.productLabel || '').toLowerCase().includes(q));
    $('historyrows').innerHTML = arr.map(x => `<tr><td><span class="pill">${x.type}</span></td><td>${esc(x.ref)}</td><td>${esc(x.customerName||x.productLabel||'Stock received')}</td><td>${new Date(x.createdAt).toLocaleString()}</td><td>${money(x.total||x.amount||0)}</td><td>${x.type==='sale'?`<button class="btn small" onclick="downloadInvoicePDF('${x.id}')">Download PDF</button> <button class="btn small" onclick="invoice('${x.id}')">View</button>`:'—'}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No transactions yet</td></tr>'
}

function notificationsPage(v) {
    setTitle('Notifications', 'Alerts and recent business activity');
    v.innerHTML = `<div class="toolbar"><button class="btn" onclick="markAllRead()">Mark all read</button><button class="btn danger" onclick="clearNotifications()">Clear all</button></div><div class="card" id="notices"></div>`;
    let ns = state.notifications.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    $('notices').innerHTML = ns.length ? ns.map(n => `<div class="notice"><span class="dot" style="opacity:${n.read?'.15':'1'}"></span><div style="flex:1;min-width:0"><div class="rowflex"><b>${esc(n.title)}</b><span class="muted">${new Date(n.createdAt).toLocaleString()}</span></div><div class="muted" style="margin-top:4px">${esc(n.desc)}</div>${n.saleId?`<div class="quick" style="margin-top:9px"><button class="btn small" onclick="invoice('${n.saleId}')">View Invoice</button><button class="btn small primary" onclick="downloadInvoicePDF('${n.saleId}')"><i data-lucide="file-down"></i>Download PDF</button></div>`:''}</div><button class="btn small" onclick="readNotice('${n.id}')">${n.read?'Read':'Mark read'}</button></div>`).join('') : '<div class="empty">You are all caught up.</div>';
    lucide.createIcons()
}

function reportsPage(v) {
    setTitle('Business Reports', 'Sales performance and current inventory outlook');
    let revenue = state.sales.reduce((a, s) => a + s.total, 0),
        cost = state.sales.reduce((a, s) => a + s.cost, 0),
        profit = state.sales.reduce((a, s) => a + s.profit, 0),
        due = state.sales.reduce((a, s) => a + s.due, 0),
        purchase = state.purchases.reduce((a, p) => a + p.amount, 0),
        s = stats();
    v.innerHTML = `<div class="grid stats" style="grid-template-columns:repeat(4,1fr)">${statCard('Purchase Cost',money(purchase),'truck')}${statCard('Sales Revenue',money(revenue),'banknote')}${statCard('Actual Profit',money(profit),'trending-up','','green')}${statCard('Outstanding Dues',money(due),'clock','','red')}${statCard('Cost of Sold Goods',money(cost),'wallet')}${statCard('Current Stock Value',money(s.rp),'boxes')}${statCard('Expected Stock Profit',money(s.profit),'chart-no-axes-combined','','green')}${statCard('Total Customers',state.customers.length,'users')}</div><div class="sectionhead"><h2>Sales summary</h2><button class="btn small" onclick="exportReports()">Export CSV</button></div><div class="card"><div class="tablewrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Revenue</th><th>Profit</th><th>Paid</th><th>Due</th></tr></thead><tbody>${state.sales.map(x=>`<tr><td>${esc(x.ref)}</td><td>${esc(x.customerName)}</td><td>${new Date(x.createdAt).toLocaleDateString()}</td><td>${money(x.total)}</td><td class="green">${money(x.profit)}</td><td>${money(x.paid)}</td><td class="red">${money(x.due)}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">No sales yet</td></tr>'}</tbody></table></div></div><p class="hint">Actual profit is based on saved purchase-cost snapshots. Expected stock profit applies only to unsold inventory.</p>`
}

function settingsPage(v) {
    setTitle('Settings', 'Business profile and data safety');
    v.innerHTML = `<div class="grid two"><div class="card"><h3>Business profile</h3><div class="field"><label>Invoice business name</label><input id="setname" value="${esc(state.settings.businessName||'Hello Jamalpur')}"></div><div class="field"><label>Phone</label><input id="setphone" value="${esc(state.settings.phone||'')}"></div><div class="field"><label>Address</label><textarea id="setaddress">${esc(state.settings.address||'')}</textarea></div><div class="field"><label>Currency symbol</label><input id="setcurrency" value="${esc(state.settings.currency||'৳')}"></div><div class="field"><label>Invoice prefix</label><input id="setprefix" value="${esc(state.settings.invoicePrefix||'INV')}"></div><div class="field"><label>Low stock threshold</label><input id="setlow" type="number" min="0" value="${state.settings.lowStock??5}"></div><button class="btn primary" onclick="saveSettingsForm()">Save settings</button></div><div class="card"><h3>Data management</h3><p class="hint">Data is stored in this browser on this device using IndexedDB. Download regular backups. Clearing browser site data may remove this workspace.</p><div class="quick" style="flex-direction:column;align-items:stretch"><button class="btn" onclick="backup()">Download JSON Backup</button><label class="btn">Restore JSON Backup<input type="file" accept="application/json" hidden onchange="restoreBackup(event)"></label><button class="btn" onclick="exportAllProducts()">Export Products CSV</button><button class="btn danger" onclick="resetData()">Reset all application data</button></div></div></div>`
}

function modal(content) {
    $('modal').innerHTML = content;
    $('modalback').classList.add('show');
    lucide.createIcons()
}

function closeModal() {
    $('modalback').classList.remove('show')
}

function field(label, name, value = '', type = 'text', extra = '') {
    return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`
}

function quickMenu() {
    modal(`<h2>Quick Add</h2><div class="quick" style="flex-direction:column;align-items:stretch"><button class="btn" onclick="closeModal();customerForm()">Add Customer</button><button class="btn" onclick="closeModal();brandForm()">Add Brand</button><button class="btn" onclick="closeModal();productForm()">Add Product</button><button class="btn" onclick="closeModal();receiveForm()">Receive Stock</button><button class="btn" onclick="closeModal();saleForm()">Sell Products</button></div><div class="modalfoot"><button class="btn" onclick="closeModal()">Close</button></div>`)
}

function brandForm(bid) {
    let b = state.brands.find(x => x.id === bid);
    modal(`<h2>${b?'Edit':'Add'} Brand</h2><form id="brandform">${field('Brand name','name',b?.name||'')}<div class="field"><label>Description (optional)</label><textarea name="description">${esc(b?.description||'')}</textarea></div><div class="modalfoot"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary">Save Brand</button></div></form>`);
    $('brandform').onsubmit = async e => {
        e.preventDefault();
        let f = new FormData(e.target),
            name = f.get('name').trim();
        if (!name) return toast('Enter a brand name');
        if (state.brands.some(x => x.name.toLowerCase() === name.toLowerCase() && x.id !== bid)) return toast('Brand already exists');
        await put('brands', {
            id: bid || uid('BR'),
            name,
            description: f.get('description')
        });
        await load();
        closeModal();
        notify(b ? 'Brand updated' : 'New brand added', name, 'brand');
        render();
        toast('Brand saved')
    }
}

function customerForm(cid) {
    let c = state.customers.find(x => x.id === cid);
    modal(`<h2>${c?'Edit':'Add'} Customer</h2><form id="customerform"><div class="formgrid">${field('Customer name','name',c?.name||'')}${field('Mobile number','phone',c?.phone||'','tel')}${field('Email (optional)','email',c?.email||'','email')}${field('Address (optional)','address',c?.address||'')}${field('Customer ID','customerId',c?.customerId||uid('CUS'))}<div class="field span2"><label>Notes</label><textarea name="notes">${esc(c?.notes||'')}</textarea></div></div><div class="modalfoot"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary">Save Customer</button></div></form>`);
    $('customerform').onsubmit = async e => {
        e.preventDefault();
        let f = new FormData(e.target),
            name = f.get('name').trim(),
            phone = f.get('phone').trim(),
            customerId = f.get('customerId').trim();
        if (!name || !phone) return toast('Name and mobile are required');
        if (state.customers.some(x => x.customerId === customerId && x.id !== cid)) return toast('Customer ID already exists');
        if (state.customers.some(x => x.phone === phone && x.id !== cid)) return toast('Mobile already registered');
        await put('customers', {
            id: cid || uid('CUS'),
            name,
            phone,
            email: f.get('email'),
            address: f.get('address'),
            customerId,
            notes: f.get('notes')
        });
        await load();
        closeModal();
        notify(c ? 'Customer updated' : 'New customer added', name);
        render();
        toast('Customer saved')
    }
}

function productForm(bid, pid) {
    let p = state.products.find(x => x.id === pid),
        brand = bid || p?.brandId;
    modal(`<h2>${p?'Edit':'Add'} Product</h2><form id="productform"><div class="field"><label>Brand</label><select name="brandId" required>${state.brands.map(b=>`<option value="${b.id}" ${b.id===brand?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div><div class="formgrid">${field('Model','model',p?.model||'')}${field('Variant','variant',p?.variant||'')}${field('RP price','rp',p?.rp??0,'number','min="0" step=".01"')}${field('MRP price','MRP',p?.MRP??0,'number','min="0" step=".01"')}${field('Minimum stock alert','minStock',p?.minStock??state.settings.lowStock,'number','min="0"')}</div><div class="modalfoot"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary">Save Product</button></div></form>`);
    $('productform').onsubmit = async e => {
        e.preventDefault();
        let f = new FormData(e.target),
            model = f.get('model').trim(),
            variant = f.get('variant').trim(),
            brandId = f.get('brandId');
        if (!brandId || !model || !variant) return toast('Brand, model and variant required');
        if (state.products.some(x => x.brandId === brandId && x.model.toLowerCase() === model.toLowerCase() && x.variant.toLowerCase() === variant.toLowerCase() && x.id !== pid)) return toast('Product already exists in this brand');
        await put('products', {
            id: pid || uid('PRD'),
            brandId,
            model,
            variant,
            rp: +f.get('rp'),
            MRP: +f.get('MRP'),
            qty: p?.qty || 0,
            minStock: +f.get('minStock'),
            notes: p?.notes || ''
        });
        await load();
        closeModal();
        notify(p ? 'Product updated' : 'Product added', brandName(brandId) + ' · ' + model);
        if (page === 'brand') render();
        else go('brands');
        toast('Product saved')
    }
}
async function duplicateProduct(pid) {
    let p = state.products.find(x => x.id === pid);
    await put('products', {
        ...p,
        id: uid('PRD'),
        model: p.model + ' copy',
        qty: 0
    });
    await load();
    render();
    toast('Product duplicated')
}
async function deleteProduct(pid) {
    if (!confirm('Delete this product? Historical invoices will remain.')) return;
    await del('products', pid);
    await load();
    render();
    toast('Product deleted')
}

function receiveForm(bid) {
    if (!state.brands.length) return toast('Add a brand first');
    modal(`<h2>Receive Stock</h2><form id="receiveform"><div class="field"><label>Brand</label><select name="brandId" id="recvbrand" onchange="updateReceiveProducts()">${state.brands.map(b=>`<option value="${b.id}" ${b.id===bid?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div><div class="field"><label>Existing product</label><select name="productId" id="recvproduct"></select></div><div id="newproductfields" class="formgrid">${field('Model','model')}${field('Variant','variant')}${field('Default MRP price','MRP',0,'number','min="0" step=".01"')}</div><div class="formgrid">${field('Quantity received','qty',1,'number','min="1" step="1"')}${field('Purchase RP price per unit','rp',0,'number','min="0" step=".01"')}${field('Supplier (optional)','supplier')}${field('Purchase reference (optional)','reference')}</div><div class="field"><label>Notes</label><textarea name="notes"></textarea></div><div class="modalfoot"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary">Confirm Receive</button></div></form>`);
    updateReceiveProducts();
    $('receiveform').onsubmit = async e => {
        e.preventDefault();
        let f = new FormData(e.target),
            brandId = f.get('brandId'),
            pid = f.get('productId'),
            qty = +f.get('qty'),
            rp = +f.get('rp');
        if (!Number.isInteger(qty) || qty < 1 || !Number.isFinite(rp) || rp < 0) return toast('Enter valid quantity and RP');
        let p = state.products.find(x => x.id === pid);
        if (pid === 'new') {
            let model = f.get('model').trim(),
                variant = f.get('variant').trim();
            if (!model || !variant) return toast('Enter model and variant');
            p = {
                id: uid('PRD'),
                brandId,
                model,
                variant,
                rp,
                MRP: +f.get('MRP') || 0,
                qty: 0,
                minStock: state.settings.lowStock
            }
        }
        if (!p) return toast('Select a product');
        let old = p.qty;
        p.qty += qty;
        p.rp = rp;
        await put('products', p);
        await put('purchases', {
            id: uid('PUR'),
            ref: uid('PO'),
            productId: p.id,
            brandId,
            qty,
            rp,
            amount: qty * rp,
            supplier: f.get('supplier'),
            reference: f.get('reference'),
            note: f.get('notes'),
            createdAt: now(),
            productLabel: p.model + ' ' + p.variant
        });
        await load();
        closeModal();
        notify('Stock received', `${qty} × ${p.model}; stock ${old} → ${p.qty}`, 'purchase');
        render();
        toast('Stock received successfully')
    }
}

function updateReceiveProducts() {
    let bid = $('recvbrand')?.value,
        sel = $('recvproduct');
    if (!sel) return;
    sel.innerHTML = '<option value="new">＋ Create new product</option>' + productsFor(bid).map(p => `<option value="${p.id}">${esc(p.model)} · ${esc(p.variant)} (${p.qty} in stock)</option>`).join('');
    $('newproductfields').classList.toggle('hidden', sel.value !== 'new');
    sel.onchange = () => {
        $('newproductfields').classList.toggle('hidden', sel.value !== 'new');
        let p = state.products.find(x => x.id === sel.value);
        if (p) $('receiveform').elements.rp.value = p.rp
    }
}

function saleForm() {
    if (!state.products.some(p => p.qty > 0)) return toast('No available stock to sell');
    modal(`<h2>New Sale</h2><form id="saleform"><div class="formgrid"><div class="field"><label>Customer</label><select name="customerId"><option value="">Walk-in Customer</option>${state.customers.map(c=>`<option value="${c.id}">${esc(c.name)} · ${esc(c.phone)}</option>`).join('')}</select></div><div class="field"><label>Payment method</label><select name="payment"><option>Cash</option><option>Bank</option><option>Mobile Banking</option><option>Card</option><option>Other</option></select></div></div><div id="saleitems"></div><button type="button" class="btn small" onclick="addSaleRow()">＋ Add another product</button><div class="formgrid" style="margin-top:14px">${field('Discount amount','discount',0,'number','min="0" step=".01"')}${field('Amount paid','paid',0,'number','min="0" step=".01"')}</div><div class="card" style="background:#f8fafc;box-shadow:none"><div class="rowflex"><span>Subtotal</span><b id="salesub">${money(0)}</b></div><div class="rowflex"><span>Grand total</span><b id="saletotal">${money(0)}</b></div><div class="rowflex"><span>Due</span><b id="saledue">${money(0)}</b></div><div class="rowflex"><span>Estimated profit</span><b class="green" id="saleprofit">${money(0)}</b></div></div><div class="field"><label>Invoice notes</label><textarea name="notes"></textarea></div><div class="modalfoot"><button type="button" class="btn" onclick="closeModal()">Cancel</button><button class="btn primary">Complete Sale</button></div></form>`);
    addSaleRow();
    $('saleform').elements.discount.addEventListener('input', calcSale);
    $('saleform').elements.paid.addEventListener('input', calcSale);
    $('saleform').onsubmit = completeSale
}

function addSaleRow() {
    let wrap = $('saleitems'),
        idx = wrap.children.length,
        brands = state.brands.filter(b => productsFor(b.id).some(p => p.qty > 0)),
        el = document.createElement('div');
    el.className = 'saleitem';
    el.innerHTML = `<div class="rowflex"><b>Product ${idx+1}</b><button type="button" class="btn small danger" onclick="this.closest('.saleitem').remove();calcSale()">Remove</button></div><div class="formgrid"><div class="field"><label>Brand</label><select class="sbrand" onchange="saleBrandChanged(this)"><option value="">Choose brand</option>${brands.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div><div class="field"><label>Product</label><select class="sproduct" onchange="saleProductChanged(this)"><option value="">Choose product</option></select></div><div class="field"><label>Quantity · Available <span class="avail">—</span></label><input class="sqty" type="number" min="1" value="1" oninput="calcSale()"></div><div class="field"><label>Selling price / unit</label><input class="sprice" type="number" min="0" step=".01" value="0" oninput="calcSale()"></div></div>`;
    wrap.appendChild(el)
}

function saleBrandChanged(sel) {
    let row = sel.closest('.saleitem'),
        ps = productsFor(sel.value).filter(p => p.qty > 0);
    row.querySelector('.sproduct').innerHTML = '<option value="">Choose product</option>' + ps.map(p => `<option value="${p.id}">${esc(p.model)} · ${esc(p.variant)} (${p.qty})</option>`).join('');
    row.querySelector('.avail').textContent = '—';
    calcSale()
}

function saleProductChanged(sel) {
    let row = sel.closest('.saleitem'),
        p = state.products.find(x => x.id === sel.value);
    row.querySelector('.sprice').value = p?.MRP || 0;
    row.querySelector('.avail').textContent = p?.qty ?? '—';
    row.querySelector('.sqty').max = p?.qty || 1;
    calcSale()
}

function saleLines() {
    return [...document.querySelectorAll('.saleitem')].map(row => {
        let p = state.products.find(x => x.id === row.querySelector('.sproduct').value);
        return p ? {
            product: p,
            qty: +row.querySelector('.sqty').value,
            price: +row.querySelector('.sprice').value
        } : null
    }).filter(Boolean)
}

function calcSale() {
    let lines = saleLines(),
        sub = lines.reduce((a, l) => a + l.qty * l.price, 0),
        cost = lines.reduce((a, l) => a + l.qty * l.product.rp, 0),
        discount = +($('saleform')?.elements.discount.value || 0),
        total = Math.max(0, sub - discount),
        paid = +($('saleform')?.elements.paid.value || 0);
    if ($('salesub')) $('salesub').textContent = money(sub);
    if ($('saletotal')) $('saletotal').textContent = money(total);
    if ($('saledue')) $('saledue').textContent = money(Math.max(0, total - paid));
    if ($('saleprofit')) $('saleprofit').textContent = money(cost ? lines.reduce((a, l) => a + l.qty * (l.price - l.product.rp), 0) - discount : 0)
}
async function completeSale(e) {
    e.preventDefault();
    let form = e.target,
        lines = saleLines(),
        discount = +form.elements.discount.value,
        paid = +form.elements.paid.value;
    if (!lines.length) return toast('Add at least one product');
    for (let l of lines) {
        if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > l.product.qty) return toast('Quantity exceeds stock for ' + l.product.model);
        if (!Number.isFinite(l.price) || l.price < 0) return toast('Invalid selling price')
    }
    let subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0),
        total = subtotal - discount;
    if (discount < 0 || discount > subtotal || paid < 0 || paid > total) return toast('Check discount and paid amount');
    let customer = state.customers.find(c => c.id === form.elements.customerId.value),
        sale = {
            id: uid('SAL'),
            ref: (state.settings.invoicePrefix || 'INV') + '-' + Date.now().toString().slice(-8),
            customerId: customer?.id || '',
            customerName: customer?.name || 'Walk-in Customer',
            customerPhone: customer?.phone || '',
            customerCode: customer?.customerId || '',
            items: lines.map(l => ({
                productId: l.product.id,
                brandId: l.product.brandId,
                brand: brandName(l.product.brandId),
                model: l.product.model,
                variant: l.product.variant,
                qty: l.qty,
                price: l.price,
                rp: l.product.rp
            })),
            subtotal,
            discount,
            total,
            cost: lines.reduce((a, l) => a + l.qty * l.product.rp, 0),
            profit: lines.reduce((a, l) => a + l.qty * (l.price - l.product.rp), 0) - discount,
            paid,
            due: total - paid,
            payment: form.elements.payment.value,
            notes: form.elements.notes.value,
            createdAt: now()
        };
    try {
        let tx = db.transaction(['products', 'sales', 'notifications'], 'readwrite'),
            ps = tx.objectStore('products'),
            ss = tx.objectStore('sales'),
            ns = tx.objectStore('notifications'),
            failed = false;
        let done = txDone(tx);
        for (let l of lines) {
            let req = ps.get(l.product.id);
            req.onsuccess = () => {
                let p = req.result;
                if (!p || p.qty < l.qty) {
                    failed = true;
                    try {
                        tx.abort()
                    } catch (_) {}
                    return
                }
                p.qty -= l.qty;
                ps.put(p)
            }
        }
        ss.add(sale);
        ns.add({
            id: uid('NTF'),
            title: 'Sale completed',
            desc: `${sale.ref} · ${sale.customerName} · ${money(total)}`,
            type: 'sale',
            createdAt: now(),
            read: false,
            saleId: sale.id
        });
        await done;
        if (failed) throw new Error('Stock changed. Refresh and try again.');
        await load();
        closeModal();
        render();
        toast('Sale completed · ' + sale.ref);
        setTimeout(() => downloadInvoicePDF(sale.id), 250)
    } catch (err) {
        console.error(err);
        toast(err.message || 'Sale failed. Please retry.')
    }
}

function reqPromise(r) {
    return new Promise((res, rej) => {
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error)
    })
}

function txDone(tx) {
    return new Promise((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error('Transaction aborted'))
    })
}

function invoiceHTML(s) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.ref)}</title><style>body{font:14px Arial;color:#17243b;padding:32px;max-width:800px;margin:auto}.head{display:flex;justify-content:space-between;border-bottom:2px solid #169b68;padding-bottom:18px}h1{color:#169b68}small{color:#68758a}.meta{display:flex;justify-content:space-between;margin:24px 0}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}th{background:#f4f7f8}.total{margin:22px 0 0 auto;width:260px}.total div{display:flex;justify-content:space-between;padding:6px}.grand{font-size:19px;font-weight:bold;border-top:2px solid #169b68;padding-top:10px!important}.foot{text-align:center;margin-top:45px;color:#68758a;font-size:11px}@media print{body{padding:0}}</style></head><body><div class="head"><div><h1>${esc(state.settings.businessName||'Hello Jamalpur')}</h1><small>${esc(state.settings.address||'')}<br>${esc(state.settings.phone||'')}</small></div><div style="text-align:right"><h2>INVOICE</h2><b>${esc(s.ref)}</b><br><small>${new Date(s.createdAt).toLocaleString()}</small></div></div><div class="meta"><div><b>Bill To</b><br>${esc(s.customerName)}<br>${esc(s.customerCode)}<br>${esc(s.customerPhone)}</div><div><b>Payment</b><br>${esc(s.payment)}<br>Status: ${s.due?'Due':'Paid'}</div></div><table><thead><tr><th>Product</th><th>Brand</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>${s.items.map(i=>`<tr><td>${esc(i.model)} · ${esc(i.variant)}</td><td>${esc(i.brand)}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.qty*i.price)}</td></tr>`).join('')}</tbody></table><div class="total"><div><span>Subtotal</span><b>${money(s.subtotal)}</b></div><div><span>Discount</span><b>${money(s.discount)}</b></div><div class="grand"><span>Grand Total</span><b>${money(s.total)}</b></div><div><span>Paid</span><b>${money(s.paid)}</b></div><div><span>Due</span><b>${money(s.due)}</b></div></div><p>${esc(s.notes||'')}</p><div class="foot">Thank you for your business.<br>HELLO JAMALPUR · POWERED BY MAXORA</div></body></html>`
}

function invoice(sid) {
    let s = state.sales.find(x => x.id === sid);
    if (!s) return toast('Invoice not found');
    let w = window.open('', '_blank');
    if (!w) return toast('Pop-ups blocked. Use Download PDF instead.');
    w.document.open();
    w.document.write(invoiceHTML(s));
    w.document.close();
    setTimeout(() => w.print(), 500)
}

function pdfReady() {
    return !!(window.jspdf && window.jspdf.jsPDF)
}

function pdfMoney(n) {
    return money(n).replace('৳', 'BDT ')
}

function safePdfText(doc, text, x, y, maxWidth) {
    let lines = doc.splitTextToSize(String(text ?? ''), maxWidth);
    doc.text(lines, x, y);
    return y + lines.length * 6
}

function downloadInvoicePDF(sid) {
    let s = state.sales.find(x => x.id === sid);
    if (!s) return toast('Invoice not found');
    if (!pdfReady()) {
        toast('PDF library unavailable. Opening print view instead.');
        invoice(sid);
        return
    }
    try {
        const {
            jsPDF
        } = window.jspdf, doc = new jsPDF({
            unit: 'mm',
            format: 'a4'
        }), W = doc.internal.pageSize.getWidth();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(22, 155, 104);
        doc.text(String(state.settings.businessName || 'Hello Jamalpur'), 14, 18);
        doc.setFontSize(10);
        doc.setTextColor(90, 100, 115);
        doc.setFont('helvetica', 'normal');
        let y = 25;
        if (state.settings.address) y = safePdfText(doc, state.settings.address, 14, y, W - 28);
        if (state.settings.phone) y = safePdfText(doc, 'Phone: ' + state.settings.phone, 14, y, W - 28);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(25, 36, 59);
        doc.text('INVOICE', W - 14, 18, {
            align: 'right'
        });
        doc.setFontSize(10);
        doc.text(s.ref, W - 14, 25, {
            align: 'right'
        });
        doc.setFont('helvetica', 'normal');
        doc.text(new Date(s.createdAt).toLocaleString(), W - 14, 31, {
            align: 'right'
        });
        y = Math.max(y, 40);
        doc.setDrawColor(22, 155, 104);
        doc.line(14, y, W - 14, y);
        y += 9;
        doc.setFont('helvetica', 'bold');
        doc.text('Bill To', 14, y);
        doc.text('Payment', W / 2, y);
        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.text(String(s.customerName || 'Walk-in Customer'), 14, y);
        doc.text(String(s.payment || '—') + ' · ' + (s.due ? 'Due' : 'Paid'), W / 2, y);
        y += 6;
        if (s.customerPhone) doc.text(String(s.customerPhone), 14, y);
        if (s.customerCode) doc.text(String(s.customerCode), 14, y + 5);
        y += 12;
        let body = s.items.map(i => [`${i.model} · ${i.variant}`, i.brand, String(i.qty), pdfMoney(i.price), pdfMoney(i.qty * i.price)]);
        if (typeof doc.autoTable === 'function') {
            doc.autoTable({
                startY: y,
                head: [
                    ['Product', 'Brand', 'Qty', 'Unit Price', 'Amount']
                ],
                body,
                theme: 'grid',
                headStyles: {
                    fillColor: [22, 155, 104]
                },
                styles: {
                    fontSize: 8,
                    cellPadding: 3
                },
                margin: {
                    left: 14,
                    right: 14
                }
            });
            y = doc.lastAutoTable.finalY + 9
        } else {
            doc.setFont('helvetica', 'bold');
            doc.text('Product / Variant       Brand       Qty       Unit Price       Amount', 14, y);
            y += 7;
            doc.setFont('helvetica', 'normal');
            body.forEach(r => {
                y = safePdfText(doc, r.join(' | '), 14, y, W - 28) + 2
            })
        }
        let totals = [
            ['Subtotal', s.subtotal],
            ['Discount', s.discount],
            ['Grand Total', s.total],
            ['Paid', s.paid],
            ['Due', s.due]
        ];
        let tx = W - 75;
        totals.forEach((r, i) => {
            doc.setFont('helvetica', i === 2 ? 'bold' : 'normal');
            doc.setFontSize(i === 2 ? 12 : 10);
            doc.text(r[0], tx, y);
            doc.text(pdfMoney(r[1]), W - 14, y, {
                align: 'right'
            });
            y += 7
        });
        if (s.notes) {
            y += 4;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            y = safePdfText(doc, 'Notes: ' + s.notes, 14, y, W - 28)
        }
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text('Thank you for your business · HELLO JAMALPUR · POWERED BY MAXORA', W / 2, 285, {
            align: 'center'
        });
        doc.save(`${String(s.ref).replace(/[^a-z0-9-_]/gi,'_')}_invoice.pdf`);
        toast('Invoice PDF downloaded')
    } catch (e) {
        console.error(e);
        toast('PDF generation failed. Try Print / Save as PDF.');
        invoice(sid)
    }
}

function downloadBrandPDF(bid) {
    let b = state.brands.find(x => x.id === bid);
    if (!b) return toast('Brand not found');
    let ps = productsFor(bid);
    if (!pdfReady()) {
        toast('PDF library unavailable. Use Print / Save as PDF.');
        printBrand(bid);
        return
    }
    try {
        const {
            jsPDF
        } = window.jspdf, doc = new jsPDF({
            unit: 'mm',
            format: 'a4',
            orientation: 'landscape'
        }), W = doc.internal.pageSize.getWidth(), qty = ps.reduce((a, p) => a + p.qty, 0), rp = ps.reduce((a, p) => a + p.qty * p.rp, 0), MRP = ps.reduce((a, p) => a + p.qty * p.MRP, 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(22, 155, 104);
        doc.text(String(b.name) + ' — Stock Sheet', 14, 18);
        doc.setFontSize(9);
        doc.setTextColor(90, 100, 115);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated: ${new Date().toLocaleString()}   |   Models: ${ps.length}   |   Units: ${qty}`, 14, 25);
        doc.text(`RP Stock Value: ${pdfMoney(rp)}     MRP Stock Value: ${pdfMoney(MRP)}     Expected Profit: ${pdfMoney(MRP-rp)}`, 14, 31);
        let rows = ps.map(p => [p.model, p.variant, String(p.qty), pdfMoney(p.rp), pdfMoney(p.MRP), pdfMoney(p.MRP - p.rp), pdfMoney(p.rp * p.qty), pdfMoney((p.MRP - p.rp) * p.qty)]);
        if (typeof doc.autoTable === 'function') {
            doc.autoTable({
                startY: 38,
                head: [
                    ['Model', 'Variant', 'Qty', 'RP', 'MRP', 'Unit Profit', 'Stock Value', 'Expected Profit']
                ],
                body: rows,
                theme: 'grid',
                headStyles: {
                    fillColor: [22, 155, 104]
                },
                styles: {
                    fontSize: 8,
                    cellPadding: 3
                },
                margin: {
                    left: 14,
                    right: 14
                },
                didDrawPage: () => {
                    doc.setFontSize(8);
                    doc.setTextColor(130);
                    doc.text('HELLO JAMALPUR · POWERED BY MAXORA', W - 14, doc.internal.pageSize.getHeight() - 7, {
                        align: 'right'
                    })
                }
            })
        } else {
            doc.text('PDF table extension unavailable.', 14, 42)
        }
        doc.save(`${String(b.name).replace(/[^a-z0-9-_]/gi,'_')}_stock_sheet.pdf`);
        toast('Brand stock PDF downloaded')
    } catch (e) {
        console.error(e);
        toast('PDF generation failed. Try Print / Save as PDF.');
        printBrand(bid)
    }
}

function printBrand(bid) {
    let b = state.brands.find(x => x.id === bid),
        ps = productsFor(bid),
        w = window.open('', '_blank');
    if (!w) return toast('Pop-ups blocked. Use Download Stock PDF.');
    w.document.write(`<meta charset="utf-8"><h1>${esc(b.name)} Stock Sheet</h1><p>HELLO JAMALPUR · POWERED BY MAXORA</p><table border="1" cellspacing="0" cellpadding="8"><tr><th>Model</th><th>Variant</th><th>Qty</th><th>RP</th><th>MRP</th><th>Unit Profit</th><th>Stock Value</th><th>Expected Profit</th></tr>${ps.map(p=>`<tr><td>${esc(p.model)}</td><td>${esc(p.variant)}</td><td>${p.qty}</td><td>${money(p.rp)}</td><td>${money(p.MRP)}</td><td>${money(p.MRP-p.rp)}</td><td>${money(p.rp*p.qty)}</td><td>${money((p.MRP-p.rp)*p.qty)}</td></tr>`).join('')}</table>`);
    w.document.close();
    w.print()
}

function customerProfile(cid) {
    let c = state.customers.find(x => x.id === cid),
        ss = state.sales.filter(s => s.customerId === cid),
        t = customerTotals(cid);
    modal(`<div class="profilehead"><div class="avatar">${esc(c.name[0].toUpperCase())}</div><div><h2 style="margin:0">${esc(c.name)}</h2><div class="muted">${esc(c.customerId)} · ${esc(c.phone)}</div></div></div><div class="grid three" style="margin:18px 0">${statCard('Purchases',money(t.total),'shopping-bag')}${statCard('Paid',money(t.paid),'check-circle','','green')}${statCard('Due',money(t.due),'clock','','red')}</div><h3>Purchase history</h3>${ss.length?ss.map(s=>`<div class="notice"><div style="flex:1"><b>${esc(s.ref)}</b><div class="muted">${new Date(s.createdAt).toLocaleString()} · ${money(s.total)}</div></div><button class="btn small primary" onclick="downloadInvoicePDF('${s.id}')">PDF</button></div>`).join(''):'<div class="empty">No purchases yet</div>'}<div class="modalfoot"><button class="btn" onclick="customerForm('${cid}')">Edit customer</button><button class="btn" onclick="closeModal()">Close</button></div>`)
}
async function readNotice(id) {
    let n = state.notifications.find(x => x.id === id);
    if (n) {
        n.read = true;
        await put('notifications', n);
        await load();
        render()
    }
}
async function markAllRead() {
    for (let n of state.notifications) {
        n.read = true;
        await put('notifications', n)
    }
    await load();
    render()
}
async function clearNotifications() {
    if (!confirm('Clear notification list? Sales and invoices will remain.')) return;
    for (let n of state.notifications) await del('notifications', n.id);
    await load();
    render()
}

function csvDownload(filename, rows) {
    let csv = rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n'),
        blob = new Blob(['\ufeff' + csv], {
            type: 'text/csv;charset=utf-8'
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function exportBrandCSV(bid) {
    let ps = productsFor(bid);
    csvDownload(brandName(bid) + '_stock.csv', [
        ['Brand', 'Model', 'Variant', 'Quantity', 'RP', 'MRP', 'Unit Profit', 'Stock Value', 'Expected Profit'], ...ps.map(p => [brandName(bid), p.model, p.variant, p.qty, p.rp, p.MRP, p.MRP - p.rp, p.rp * p.qty, (p.MRP - p.rp) * p.qty])
    ])
}

function exportReports() {
    csvDownload('hello_jamalpur_sales.csv', [
        ['Invoice', 'Customer', 'Date', 'Revenue', 'Cost', 'Discount', 'Profit', 'Paid', 'Due'], ...state.sales.map(s => [s.ref, s.customerName, s.createdAt, s.total, s.cost, s.discount, s.profit, s.paid, s.due])
    ])
}

function exportAllProducts() {
    csvDownload('hello_jamalpur_products.csv', [
        ['Brand', 'Model', 'Variant', 'Qty', 'RP', 'MRP'], ...state.products.map(p => [brandName(p.brandId), p.model, p.variant, p.qty, p.rp, p.MRP])
    ])
}

function backup() {
    let payload = {
        version: 1,
        exportedAt: now()
    };
    Promise.all(stores.filter(s => s !== 'settings').map(async k => payload[k] = state[k])).then(() => {
        payload.settings = state.settings;
        let url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], {
                type: 'application/json'
            })),
            a = document.createElement('a');
        a.href = url;
        a.download = 'hello-jamalpur-backup-' + day(now()) + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500)
    })
}
async function restoreBackup(e) {
    let file = e.target.files[0];
    if (!file) return;
    try {
        let d = JSON.parse(await file.text());
        if (!confirm('Restore backup? Existing data in this browser will be replaced.')) return;
        for (let s of stores.filter(x => x !== 'settings')) {
            for (let x of await all(s)) await del(s, x.id);
            for (let x of (d[s] || [])) await put(s, x)
        }
        state.settings = d.settings || state.settings;
        await saveSettings();
        await load();
        render();
        toast('Backup restored')
    } catch (err) {
        toast('Invalid backup file')
    }
}
async function saveSettingsForm() {
    state.settings = {
        ...state.settings,
        businessName: $('setname').value.trim() || 'Hello Jamalpur',
        phone: $('setphone').value,
        address: $('setaddress').value,
        currency: $('setcurrency').value || '৳',
        invoicePrefix: $('setprefix').value || 'INV',
        lowStock: Math.max(0, +$('setlow').value || 0)
    };
    await saveSettings();
    render();
    toast('Settings saved')
}
async function resetData() {
    if (!confirm('Permanently delete all business data from this browser? Download a backup first.')) return;
    for (let s of stores)
        for (let x of await all(s)) await del(s, x.id);
    await load();
    go('dashboard');
    toast('Workspace reset')
}

function importCSV(bid) {
    let inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.csv,text/csv';
    inp.onchange = async () => {
        let file = inp.files[0];
        if (!file) return;
        let text = await file.text(),
            lines = text.split(/\r?\n/).slice(1);
        for (let line of lines) {
            let vals = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g);
            if (!vals) continue;
            vals = vals.slice(0, -1).map(x => x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
            if (vals.length < 5) continue;
            let [model, variant, qty, rp, MRP] = vals;
            if (!model || !variant) continue;
            let p = state.products.find(x => x.brandId === bid && x.model === model && x.variant === variant);
            if (p) {
                p.qty = Number(qty) || p.qty;
                p.rp = Number(rp) || 0;
                p.MRP = Number(MRP) || 0;
                await put('products', p)
            } else await put('products', {
                id: uid('PRD'),
                brandId: bid,
                model,
                variant,
                qty: Number(qty) || 0,
                rp: Number(rp) || 0,
                MRP: Number(MRP) || 0,
                minStock: state.settings.lowStock
            })
        }
        await load();
        render();
        toast('CSV import complete')
    };
    inp.click()
}
document.addEventListener('click', e => {
    let b = e.target.closest('[data-page]');
    if (b) go(b.dataset.page)
});
async function init() {
    try {
        db = await openDB();
        await load();
        $('loading').style.opacity = '0';
        setTimeout(() => $('loading')?.remove(), 350);
        render()
    } catch (e) {
        console.error(e);
        $('loading').innerHTML = '<div class="card"><h2>Storage could not be initialized</h2><p>Enable site storage in your browser settings, then reload. Existing data has not been intentionally cleared.</p><button class="btn primary" onclick="location.reload()">Retry</button></div>'
    }
}
init();