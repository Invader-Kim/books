// store.js: all of your data, saved on this device in IndexedDB.
// Everything lives in one object (store.data). Every change calls store.save(),
// which writes it to the phone's storage a moment later.

export const STATUSES = [
  { id: 'wishlist', label: 'Wishlist' },
  { id: 'toread', label: 'To Read' },
  { id: 'reading', label: 'Reading' },
  { id: 'finished', label: 'Finished' },
  { id: 'dnf', label: 'Did Not Finish' },
];
export const FORMATS = ['Paperback', 'Hardcover', 'Ebook', 'Audiobook'];
export const OWNERSHIP = ['Owned', 'Borrowed', 'Not Owned'];
export const COLL_COLORS = ['#2b4a9a', '#6b4fb8', '#1f7a72', '#9a5a2b', '#a33f5b', '#3d6b2f', '#475569'];

export const statusLabel = (id) => (STATUSES.find((s) => s.id === id) || STATUSES[1]).label;

const DB_NAME = 'lamplight';
const OBJ = 'kv';
const KEY = 'state';
const LS_KEY = 'lamplight-state';

export function defaultState() {
  return {
    version: 1,
    books: [],
    collections: [],
    logs: [],
    goals: { dailyMinutes: 30, yearlyBooks: 24 },
    // your corrections to book details, remembered by ISBN so re-adding a book keeps them
    editions: {},
    // your own drag-and-drop order for the library (book ids, top first)
    libraryOrder: [],
    active: null,
    settings: { lastBackup: null, name: '', askedName: false, englishOnly: true, collectionsSort: 'custom', booksMode: 'library', openBooksOnStart: true, defaultFormat: 'Paperback' },
  };
}

// ---------- tiny helpers ----------
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const pad = (n) => String(n).padStart(2, '0');
/** Local calendar date as YYYY-MM-DD (never UTC, so late-night reading lands on the right day). */
export function dateKey(d = new Date()) {
  d = d instanceof Date ? d : new Date(d);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const todayKey = () => dateKey(new Date());
export function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;
const numOrNull = (v) => { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

// ---------- persistence ----------
let db = null;
let saveTimer = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(OBJ);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbGet() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OBJ, 'readonly');
    const r = tx.objectStore(OBJ).get(KEY);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function idbPut(value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OBJ, 'readwrite');
    tx.objectStore(OBJ).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const store = {
  data: defaultState(),
  listeners: new Set(),

  async load() {
    let loaded = null;
    try {
      db = await openDB();
      loaded = await idbGet();
    } catch (e) {
      db = null;
    }
    if (!loaded) {
      try { const raw = localStorage.getItem(LS_KEY); if (raw) loaded = JSON.parse(raw); } catch (e) { /* ignore */ }
    }
    this.data = migrate(loaded);
    return this.data;
  },

  save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => this.flush(), 120);
    this.listeners.forEach((fn) => fn());
  },

  async flush() {
    clearTimeout(saveTimer);
    const snapshot = JSON.parse(JSON.stringify(this.data));
    try {
      if (db) { await idbPut(snapshot); return; }
    } catch (e) { /* fall through to localStorage */ }
    try { localStorage.setItem(LS_KEY, JSON.stringify(snapshot)); } catch (e) { console.warn('Save failed', e); }
  },

  replaceAll(newData) {
    this.data = migrate(newData);
    this.save();
  },
};

function migrate(d) {
  const base = defaultState();
  if (!d || typeof d !== 'object') return base;
  const out = { ...base, ...d };
  out.goals = { ...base.goals, ...(d.goals || {}) };
  delete out.goals.monthlyBooks; // the monthly goal was removed in 1.3
  out.editions = d.editions && typeof d.editions === 'object' ? d.editions : {};
  out.libraryOrder = Array.isArray(d.libraryOrder) ? d.libraryOrder : [];
  out.settings = { ...base.settings, ...(d.settings || {}) };
  out.books = Array.isArray(d.books) ? d.books.map(normalizeBook) : [];
  out.collections = Array.isArray(d.collections) ? d.collections.map((c) => ({ description: '', color: COLL_COLORS[0], bookIds: [], ...c })) : [];
  out.logs = Array.isArray(d.logs) ? d.logs : [];
  return out;
}

export const yearlyGoal = () => store.data.goals.yearlyBooks;

/** Details you saved for an ISBN (pages, publisher, published, authors). */
const ED_FIELDS = ['pages', 'publisher', 'published', 'authors'];
const isbnKey = (s) => String(s || '').replace(/[^0-9Xx]/g, '').toUpperCase();
export function rememberEdition(book) {
  const k = isbnKey(book.isbn);
  if (k.length < 10) return;
  const e = {};
  ED_FIELDS.forEach((f) => { if (book[f] != null && book[f] !== '') e[f] = book[f]; });
  if (e.pages != null) e.pages = numOrNull(e.pages);
  store.data.editions[k] = e;
}
/** Overlay what you saved before for this ISBN, so the same book always comes back the same. */
export function applyEdition(details) {
  const e = store.data.editions[isbnKey(details && details.isbn)];
  return e ? { ...details, ...e } : details;
}

// ---------- books ----------
export function normalizeBook(b) {
  const now = new Date().toISOString();
  return {
    id: b.id || uid(),
    title: (b.title || 'Untitled').trim(),
    subtitle: b.subtitle || '',
    authors: b.authors || '',
    cover: b.cover || '',
    about: b.about || '',
    pages: numOrNull(b.pages),
    genres: Array.isArray(b.genres) ? b.genres.filter(Boolean) : String(b.genres || '').split(',').map((g) => g.trim()).filter(Boolean),
    format: FORMATS.includes(b.format) ? b.format : 'Paperback',
    ownership: OWNERSHIP.includes(b.ownership) ? b.ownership : 'Owned',
    status: STATUSES.some((s) => s.id === b.status) ? b.status : 'toread',
    isbn: b.isbn || '',
    booksTitle: b.booksTitle || '', // the name it has in Apple Books, if different
    publisher: b.publisher || '',
    published: b.published || '',
    rating: clamp(Number(b.rating) || 0, 0, 5),
    progressMode: b.progressMode === 'percent' ? 'percent' : 'pages',
    currentPage: numOrNull(b.currentPage),
    percent: numOrNull(b.percent),
    startedAt: b.startedAt || '',
    finishedAt: b.finishedAt || '',
    notes: Array.isArray(b.notes) ? b.notes : [],
    sample: !!b.sample,
    addedAt: b.addedAt || now,
    updatedAt: b.updatedAt || now,
  };
}

export const getBook = (id) => store.data.books.find((b) => b.id === id);

export function addBook(data) {
  const b = normalizeBook({ ...data, id: uid(), addedAt: new Date().toISOString() });
  if (!data.progressMode && b.format === 'Audiobook') b.progressMode = 'percent';
  applyStatusDates(b, null);
  store.data.books.unshift(b);
  store.save();
  return b;
}

export function updateBook(id, patch) {
  const b = getBook(id);
  if (!b) return null;
  const prevStatus = b.status;
  Object.assign(b, patch);
  if ('pages' in patch) {
    b.pages = numOrNull(patch.pages);
    if (b.pages && b.currentPage != null) b.percent = round1(clamp(b.currentPage / b.pages * 100, 0, 100));
  }
  if ('rating' in patch) b.rating = clamp(Number(patch.rating) || 0, 0, 5);
  if ('status' in patch) applyStatusDates(b, prevStatus);
  b.updatedAt = new Date().toISOString();
  store.save();
  return b;
}

function applyStatusDates(b, prev) {
  if (b.status === prev) return;
  if (b.status === 'reading' && !b.startedAt) b.startedAt = todayKey();
  if (b.status === 'finished') {
    if (!b.finishedAt) b.finishedAt = todayKey();
    if (!b.startedAt) b.startedAt = b.finishedAt;
    if (b.pages) { b.currentPage = b.pages; }
    b.percent = 100;
  } else if (prev === 'finished') {
    b.finishedAt = '';
  }
}

export function deleteBook(id) {
  const d = store.data;
  d.books = d.books.filter((b) => b.id !== id);
  d.logs = d.logs.filter((l) => l.bookId !== id);
  d.collections.forEach((c) => { c.bookIds = c.bookIds.filter((x) => x !== id); });
  if (d.active && d.active.bookId === id) d.active = null;
  store.save();
}

export function findByIsbn(isbn) {
  if (!isbn) return null;
  const clean = String(isbn).replace(/[^0-9X]/gi, '');
  return store.data.books.find((b) => b.isbn && b.isbn.replace(/[^0-9X]/gi, '') === clean) || null;
}

/** 0–100 or null when it cannot be worked out. */
export function progressPct(b) {
  if (b.status === 'finished') return 100;
  if (b.percent != null) return clamp(b.percent, 0, 100);
  if (b.pages && b.currentPage != null) return clamp(b.currentPage / b.pages * 100, 0, 100);
  return null;
}
/** Position expressed in pages when possible. */
export function pagePos(b) {
  if (b.currentPage != null) return b.currentPage;
  if (b.pages && b.percent != null) return Math.round(b.percent / 100 * b.pages);
  return null;
}

/**
 * Move a book to a new position and record a log entry.
 * pos: { page } | { percent } | { pagesRead }
 * opts: { seconds, date, startedAt, type, note }
 */
export function recordProgress(bookId, pos, opts = {}) {
  const b = getBook(bookId);
  if (!b) return null;
  const fromPage = pagePos(b);
  const fromPct = progressPct(b);
  const total = b.pages || null;

  if (pos.pagesRead != null) pos = { page: (fromPage || 0) + Math.max(0, Number(pos.pagesRead) || 0) };
  if (pos.page != null) {
    const page = clamp(Math.round(Number(pos.page) || 0), 0, total || 100000);
    b.currentPage = page;
    b.percent = total ? round1(page / total * 100) : null;
  } else if (pos.percent != null) {
    const pct = clamp(Number(pos.percent) || 0, 0, 100);
    b.percent = round1(pct);
    b.currentPage = total ? Math.round(pct / 100 * total) : null;
  }
  const toPage = pagePos(b);
  const toPct = progressPct(b);
  let pages = 0;
  if (toPage != null && fromPage != null) pages = toPage - fromPage;
  else if (toPage != null && fromPage == null) pages = toPage;
  pages = Math.max(0, pages);

  if (b.status !== 'reading' && b.status !== 'finished' && (pages > 0 || (opts.seconds || 0) > 0)) {
    const prev = b.status;
    b.status = 'reading';
    applyStatusDates(b, prev);
  }
  b.updatedAt = new Date().toISOString();

  const log = {
    id: uid(),
    bookId,
    date: opts.date || todayKey(),
    startedAt: opts.startedAt || null,
    seconds: Math.max(0, Math.round(opts.seconds || 0)),
    pages,
    fromPage, toPage,
    fromPct: fromPct == null ? null : round1(fromPct),
    toPct: toPct == null ? null : round1(toPct),
    type: opts.type || 'manual',
    note: opts.note || '',
  };
  if (log.seconds > 0 || log.pages > 0 || log.toPct !== log.fromPct) store.data.logs.push(log);

  if (opts.note && opts.note.trim()) {
    b.notes.push({ id: uid(), text: opts.note.trim(), page: toPage, createdAt: new Date().toISOString() });
  }
  store.save();
  return { book: b, log, reachedEnd: toPct != null && toPct >= 100 && b.status !== 'finished' };
}

export function deleteLog(id) {
  store.data.logs = store.data.logs.filter((l) => l.id !== id);
  store.save();
}

// ---------- notes ----------
export function addNote(bookId, text, page) {
  const b = getBook(bookId);
  if (!b || !text.trim()) return;
  b.notes.push({ id: uid(), text: text.trim(), page: numOrNull(page), createdAt: new Date().toISOString() });
  store.save();
}
export function updateNote(bookId, noteId, text, page) {
  const b = getBook(bookId);
  const n = b && b.notes.find((x) => x.id === noteId);
  if (!n) return;
  n.text = text.trim(); n.page = numOrNull(page);
  store.save();
}
export function deleteNote(bookId, noteId) {
  const b = getBook(bookId);
  if (!b) return;
  b.notes = b.notes.filter((n) => n.id !== noteId);
  store.save();
}

// ---------- collections ----------
export const getCollection = (id) => store.data.collections.find((c) => c.id === id);
export function addCollection({ name, description = '', color = COLL_COLORS[0] }) {
  const c = { id: uid(), name: name.trim() || 'New collection', description, color, bookIds: [], createdAt: new Date().toISOString() };
  store.data.collections.push(c);
  store.save();
  return c;
}
export function updateCollection(id, patch) {
  const c = getCollection(id);
  if (c) { Object.assign(c, patch); store.save(); }
  return c;
}
export function deleteCollection(id) {
  store.data.collections = store.data.collections.filter((c) => c.id !== id);
  store.save();
}
export function setBookCollections(bookId, ids) {
  store.data.collections.forEach((c) => {
    const has = c.bookIds.includes(bookId);
    const want = ids.includes(c.id);
    if (want && !has) c.bookIds.push(bookId);
    if (!want && has) c.bookIds = c.bookIds.filter((x) => x !== bookId);
  });
  store.save();
}
export const collectionsOf = (bookId) => store.data.collections.filter((c) => c.bookIds.includes(bookId));

// ---------- reading session (timer) ----------
export function startSession(bookId) {
  const b = getBook(bookId);
  store.data.active = {
    bookId,
    startedAt: Date.now(),
    pausedTotal: 0,
    pausedAt: null,
    startPage: b ? pagePos(b) : null,
    startPct: b ? progressPct(b) : null,
  };
  if (b && b.status !== 'reading') updateBook(bookId, { status: 'reading' });
  store.save();
}
export function sessionElapsed(a = store.data.active) {
  if (!a) return 0;
  const now = a.pausedAt || Date.now();
  return Math.max(0, now - a.startedAt - a.pausedTotal);
}
export function pauseSession() {
  const a = store.data.active;
  if (a && !a.pausedAt) { a.pausedAt = Date.now(); store.save(); }
}
export function resumeSession() {
  const a = store.data.active;
  if (a && a.pausedAt) { a.pausedTotal += Date.now() - a.pausedAt; a.pausedAt = null; store.save(); }
}
export function cancelSession() { store.data.active = null; store.save(); }
export function finishSession(pos, note) {
  const a = store.data.active;
  if (!a) return null;
  const seconds = Math.round(sessionElapsed(a) / 1000);
  store.data.active = null;
  return recordProgress(a.bookId, pos || {}, {
    seconds, date: dateKey(new Date(a.startedAt)), startedAt: new Date(a.startedAt).toISOString(), type: 'session', note,
  });
}
