// PrintDrop - student page. Made by KUPL

const KEY = 'printdrop_orders';   // the admin page reads the same key
const RATES = {                   // price per page (change these to match the shop)
  'Long (8×13)':  { bw: 3, color: 15 },
  'A4':           { bw: 2, color: 10 },
  'Short (8×11)': { bw: 2, color: 10 }
};
const STEPS = ['Received', 'Printing', 'Ready for Pickup'];

const $ = id => document.getElementById(id);
let chosenFile = null;
const baseTitle = document.title;

/* ---------- dark mode ---------- */
const root = document.documentElement;
const themeBtn = $('theme');

function setTheme(mode) {
  root.dataset.theme = mode;
  themeBtn.innerHTML = mode === 'dark' ? '&#9728;' : '&#9790;';
  themeBtn.setAttribute('aria-label', mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  try { localStorage.setItem('pd_theme', mode); } catch (e) {}
}

let saved = null;
try { saved = localStorage.getItem('pd_theme'); } catch (e) {}
setTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
themeBtn.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

/* ---------- saved orders ---------- */
function loadData() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { n: 0, orders: [] }; }
  catch (e) { return { n: 0, orders: [] }; }
}
function saveData(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); return true; }
  catch (e) { return false; }
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
const peso = n => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = n => String(n).padStart(3, '0');

/* ---------- files are kept in IndexedDB (localStorage is too small for 24 MB) ---------- */
function openDB() {
  return new Promise((ok, fail) => {
    const r = indexedDB.open('printdrop_files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
function fileStore(mode, fn) {
  return openDB().then(db => new Promise((ok, fail) => {
    const t = db.transaction('files', mode);
    const req = fn(t.objectStore('files'));
    t.oncomplete = () => ok(req && req.result);
    t.onerror = () => fail(t.error);
  }));
}

// random queue number that no other request is using
function newId() {
  const used = new Set(loadData().orders.map(o => o.id));
  const digits = used.size >= 800 ? 4 : 3;
  const min = Math.pow(10, digits - 1), span = 9 * min;
  let id;
  do { id = min + Math.floor(Math.random() * span); } while (used.has(id));
  return id;
}

/* ---------- price ---------- */
function getColor() { return document.querySelector('[name=color]:checked').value; }
function getSides() { return document.querySelector('[name=sides]:checked').value; }

function price() {
  const rate = RATES[$('paper').value];
  const pages = +$('pages').value, copies = +$('copies').value;
  if (!rate || pages < 1 || copies < 1) return 0;
  return pages * copies * rate[getColor()];
}
function showPrice() { $('price').textContent = peso(price()); }

['paper', 'pages', 'copies'].forEach(id => $(id).addEventListener('input', showPrice));
document.querySelectorAll('[name=color]').forEach(r => r.addEventListener('change', showPrice));

/* ---------- choosing a file ---------- */
function pickFile(f) {
  $('err').textContent = '';
  if (!f) return;
  if (!/\.(pdf|docx?|pptx?|jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(f.name) && !f.type.startsWith('image/')) {
    $('err').textContent = 'Only PDF, DOCX, PPTX or image files are allowed.';
    return;
  }
  if (f.size > 24 * 1024 * 1024) {
    $('err').textContent = 'That file is over 24 MB. Choose a smaller file.';
    return;
  }
  chosenFile = f;
  $('fname').textContent = f.name;
}

$('file').addEventListener('change', e => pickFile(e.target.files[0]));

const drop = $('drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => pickFile(e.dataTransfer.files[0]));

/* ---------- sending the request ---------- */
function saveOrder(id, hasFile) {
  const d = loadData();
  const order = {
    id: id,
    name: $('name').value.trim(),
    sid: $('sid').value.trim(),
    file: chosenFile.name,
    size: chosenFile.size,
    paper: $('paper').value,
    pages: +$('pages').value,
    copies: +$('copies').value,
    color: getColor() === 'color' ? 'Full color' : 'Black & White',
    sides: getSides(),
    notes: $('notes').value.trim(),
    price: price(),
    status: 'Received',
    time: Date.now(),
    hasFile: hasFile,
    notify: $('notify').checked
  };
  d.orders.push(order);

  if (!saveData(d)) {
    $('err').textContent = 'Could not save your request. Try again.';
    if (hasFile) fileStore('readwrite', s => s.delete(id)).catch(() => {});
    return;
  }

  addList(MINE, order.id);   // remember this request belongs to this device
  $('qnum').textContent = pad(order.id);
  $('dinfo').textContent = order.file + ' · ' + peso(order.price);
  $('done').showModal();
  $('qn').value = order.id;
}

$('form').addEventListener('submit', e => {
  e.preventDefault();
  const err = $('err');
  if (!chosenFile) { err.textContent = 'Choose a file to print.'; return; }
  if (!$('name').value.trim() || !$('sid').value.trim()) { err.textContent = 'Enter your full name and student ID.'; return; }
  if (!$('paper').value) { err.textContent = 'Choose a paper size.'; return; }
  const pg = +$('pages').value, cp = +$('copies').value;
  if (!Number.isInteger(pg) || !Number.isInteger(cp) || pg < 1 || cp < 1) { err.textContent = 'Number of pages and copies must be whole numbers, at least 1.'; return; }
  if (pg > 500 || cp > 100) { err.textContent = 'Maximum is 500 pages and 100 copies.'; return; }
  err.textContent = '';
  if ($('notify').checked) askPermission();   // must happen on the tap

  // keep the file for the print shop, then save the request
  const id = newId();
  const btn = $('form').querySelector('button[type=submit]');
  btn.disabled = true;   // no double submit
  fileStore('readwrite', s => s.put(chosenFile, id))
    .then(() => true, () => false)
    .then(ok => saveOrder(id, ok))
    .finally(() => { btn.disabled = false; });
});

$('ok').addEventListener('click', () => {
  $('done').close();
  $('form').reset();
  chosenFile = null;
  $('fname').textContent = '';
  showPrice();
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
});

/* ---------- tracking ---------- */
function showStatus() {
  const n = +$('qn').value;
  const order = loadData().orders.find(o => o.id === n);
  const box = $('result');
  if (!order) {
    box.innerHTML = '<p class="err">No request found with that queue number.</p>';
    return;
  }
  const at = Math.max(0, STEPS.indexOf(order.status));
  const msg = [
    'The print shop has received your file.',
    'The print shop is printing your file.',
    'Your file is ready. Pay and pick it up at the shop.'
  ][at];
  box.innerHTML =
    '<p><b>#' + pad(order.id) + '</b> &bull; ' + esc(order.file) + '</p>' +
    '<p><span class="badge">' + esc(order.status) + '</span></p>' +
    '<div class="steps">' + STEPS.map((s, i) => '<i class="' + (i <= at ? 'on' : '') + '" title="' + s + '"></i>').join('') + '</div>' +
    '<p>' + msg + '</p>';
}

$('track').addEventListener('click', showStatus);
$('qn').addEventListener('keydown', e => { if (e.key === 'Enter') showStatus(); });
window.addEventListener('storage', () => { if ($('qn').value) showStatus(); });

/* ---------- "ready for pickup" notifications ---------- */
const MINE = 'pd_mine';        // requests sent from this device
const SEEN = 'pd_notified';    // requests we already notified about

function getList(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; }
}
function addList(key, id) {
  const list = getList(key);
  if (!list.includes(id)) {
    list.push(id);
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
  }
}

// a service worker lets phones show real notifications (needs https or localhost)
let swReg = null;
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(r => { swReg = r; }).catch(() => {});
}

function askPermission() {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  try { Notification.requestPermission(); } catch (e) {}
}

function showToast(msg) {
  $('toast').textContent = msg;
  $('toast').classList.remove('hide');
}
$('toast').addEventListener('click', () => {
  $('toast').classList.add('hide');
  document.title = baseTitle;
});

function notifyReady(order) {
  const title = 'Your file is ready!';
  const body = 'Queue #' + pad(order.id) + ' (' + order.file + ') is ready for pickup at the print shop.';
  showToast(title + ' ' + body);                 // always shown on the page
  document.title = '(1) Ready for pickup | PrintDrop';
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

  if ('Notification' in window && Notification.permission === 'granted') {
    const opts = { body: body, icon: 'logo-main.png', tag: 'pd-' + order.id };
    if (swReg && swReg.showNotification) swReg.showNotification(title, opts);
    else { try { new Notification(title, opts); } catch (e) {} }
  }
}

function checkReady() {
  const mine = getList(MINE), seen = getList(SEEN);
  loadData().orders.forEach(o => {
    if (mine.includes(o.id) && o.notify && o.status === 'Ready for Pickup' && !seen.includes(o.id)) {
      addList(SEEN, o.id);
      notifyReady(o);
    }
  });
}
setInterval(checkReady, 4000);
window.addEventListener('storage', checkReady);
checkReady();

showPrice();
