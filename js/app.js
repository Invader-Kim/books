// app.js: the screens, navigation and everything you tap.
import {
  store, STATUSES, FORMATS, OWNERSHIP, COLL_COLORS, statusLabel, todayKey, parseKey,
  getBook, addBook, updateBook, deleteBook, findByIsbn, progressPct, pagePos, recordProgress, deleteLog,
  addNote, updateNote, deleteNote, getCollection, addCollection, updateCollection, deleteCollection,
  setBookCollections, collectionsOf, startSession, sessionElapsed, pauseSession, resumeSession,
  cancelSession, finishSession, yearlyGoal, timesFinished, startReread, restoreBook, rememberEdition, applyEdition,
} from './store.js';
import {
  esc, icon, coverHtml, starsHtml, paintStars, fmtRating, starValueAt, ringHtml, openSheet, closeSheet,
  closeAllSheets, sheetHead, confirmSheet, toast, fmtClock, fmtMinutes, fmtDate, plural, imageFileToDataUrl,
} from './ui.js';
import { byDay, streaks, speed, bookTotals, minutesOn, finishedIn, yearTotals, heatLevel } from './stats.js';
import { searchBooks, completeResult, lookupIsbn, lookupForBook, extractIsbn, isOnline, cleanIsbn } from './lookup.js';
import { startScanner, stopScanner, scanImageFile } from './scanner.js';
import { GENRE_GROUPS, BUILT_IN_GENRES, genreList } from './genres.js';
import { loadSamples, removeSamples, hasSamples } from './sample.js';
import { checkGoals, primeCelebrations, showCelebration } from './celebrate.js';

const APP_VERSION = '1.10.0';
const view = document.getElementById('view');
const timerBar = document.getElementById('timer-bar');

const ui = {
  lib: { q: '', status: 'all', own: 'all', format: 'all', genre: 'all', sort: 'added' },
  qaStatus: 'toread',
  search: { q: '', lastQ: '', state: 'idle', results: [], busy: new Set(), error: '' },
  keepScanning: false,
  cal: null,
  aboutOpen: {},
  navDepth: 0,
  route: { name: 'home', id: null },
  wakeLock: null,
  wantWake: false,
};

// ======================================================================
// Routing
// ======================================================================
function parseRoute() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  return { name: parts[0] || 'home', id: parts[1] ? decodeURIComponent(parts[1]) : null };
}
function go(hash) { if (location.hash !== hash) { ui.navDepth += 1; location.hash = hash; } }
function back(fallback = '#/library') {
  if (ui.navDepth > 0) { ui.navDepth -= 1; history.back(); } else { location.replace(fallback); }
}
window.addEventListener('hashchange', () => {
  const prev = ui.route;
  ui.route = parseRoute();
  closeAllSheets();
  render(prev.name === ui.route.name && prev.id === ui.route.id);
});

let renderQueued = false;
let dragging = null;
let renderAfterDrag = false;
function scheduleRender() {
  if (dragging) { renderAfterDrag = true; return; }
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(true); });
}

function render(keepScroll = false) {
  const y = window.scrollY;
  const { name, id } = ui.route;
  let html = '';
  switch (name) {
    case 'home': html = viewHome(); break;
    case 'library': html = viewLibrary(); break;
    case 'search': html = viewSearch(); break;
    case 'book': html = viewBook(id); break;
    case 'collections': html = viewCollections(); break;
    case 'collection': html = viewCollection(id); break;
    case 'stats': html = viewStats(); break;
    case 'settings': html = viewSettings(); break;
    case 'timer': html = viewTimer(); break;
    default: html = viewHome();
  }
  view.innerHTML = html;
  const tab = { book: 'library', collection: 'collections', timer: 'home' }[name] || name;
  document.querySelectorAll('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  window.scrollTo(0, keepScroll ? y : 0);
  renderTimerBar();
  tick();
}

// ======================================================================
// Shared pieces
// ======================================================================
/** ✕ at the right end of a search bar; shown only when there's text to clear. */
const clearBtn = (value) => `<button type="button" class="search-clear" data-act="clear-search" aria-label="Clear search" ${value ? '' : 'hidden'}>${icon('close')}</button>`;
const statusPill = (s) => `<span class="pill st-${s}"><span class="dot"></span>${esc(statusLabel(s))}</span>`;
const fab = (act, label, extra = '') => `<button class="fab" data-act="${act}" ${extra} aria-label="${esc(label)}">${icon('plus')}</button>`;
const backBtn = (fallback) => `<button class="icon-btn" data-act="back" data-fallback="${fallback}" aria-label="Back">${icon('back')}</button>`;

function bookRow(b, extra = '') {
  const pct = progressPct(b);
  const nNotes = b.notes.length;
  return `<a class="book-row" href="#/book/${b.id}" data-nav data-id="${b.id}">
    <span class="cover-wrap">${coverHtml(b, 'sm')}${nNotes ? `<span class="note-dot" title="${plural(nNotes, 'note')}" aria-label="${plural(nNotes, 'note')}"></span>` : ''}</span>
    <div class="info">
      <div class="t">${esc(b.title)}</div>
      <div class="a">${esc(b.authors || 'Unknown author')}</div>
      <div class="meta">${statusPill(b.status)}${b.status === 'reading' && b.reads.length ? '<span class="pill reread">Re-read</span>' : ''}${b.rating ? starsHtml(b.rating) : ''}<span class="pill">${esc(b.format)}</span>${b.ownership !== 'Owned' ? `<span class="pill">${esc(b.ownership)}</span>` : ''}</div>
      ${b.status === 'reading' && pct != null ? `<div class="bar thin" style="margin-top:6px"><i style="width:${pct}%"></i></div>` : ''}
    </div>${extra || icon('chev', 'chev')}</a>`;
}

function progressText(b) {
  const pct = progressPct(b);
  const page = pagePos(b);
  if (b.progressMode === 'percent' || (page == null && pct != null)) return pct != null ? `${Math.round(pct)}%` : 'Not started';
  if (page == null || (page === 0 && !(pct > 0))) return 'Not started';
  return b.pages ? `p. ${page} of ${b.pages}` : `p. ${page}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Up late reading?';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const PREVIEW = !!window.LAMPLIGHT_PREVIEW;
function sampleBanner() {
  const pv = PREVIEW ? `<div class="callout" style="margin-bottom:14px"><b>Preview.</b> Look around here; for your real library, install your own copy. Camera scanning, offline use and backups work in the installed app.</div>` : '';
  return pv + (hasSamples() ? `<div class="sample-banner"><span>These are example books so you can look around.</span><button class="btn small ghost" data-act="remove-samples">Remove</button></div>` : '');
}

// ======================================================================
// Home
// ======================================================================
function viewHome() {
  const d = store.data;
  const reading = d.books.filter((b) => b.status === 'reading');
  const upNext = d.books.filter((b) => b.status === 'toread').slice(0, 10);
  const st = streaks();
  const now = new Date();
  const todayMin = minutesOn(todayKey());
  const yearDone = finishedIn(now.getFullYear(), null).length;
  const g = d.goals;

  let readingHtml;
  if (!d.books.length) {
    readingHtml = `<div class="empty"><b>Your shelf is empty</b>Add your first book by scanning its barcode, searching, or typing it in.
      <div class="btn-row" style="justify-content:center;margin-top:16px"><button class="btn primary" data-act="add-book">${icon('plus')}Add a book</button></div>
      <button class="link-btn" data-act="load-samples" style="margin-top:10px">Or look around with example books</button></div>`;
  } else if (!reading.length) {
    readingHtml = `<div class="empty"><b>Nothing on the go</b>Pick something from your To Read pile and set it to Reading.</div>`;
  } else {
    readingHtml = `<div class="reading-scroller">${reading.map((b) => readingCard(b, true)).join('')}</div>`;
  }

  return `
  <div class="hello">
    <div class="eyebrow">${esc(now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</div>
    <h1>${greeting()}${store.data.settings.name ? `, <span class="hello-name">${esc(store.data.settings.name)}</span>` : ''}</h1>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 6px">
    ${st.current ? `<a class="streak-chip" href="#/stats" data-nav>${icon('flame')}${st.current}-day streak${st.readToday ? '' : ' · read today to keep it'}</a>` : (d.logs.length ? `<span class="streak-chip">${icon('flame')}Start a new streak today</span>` : '')}
  </div>
  ${sampleBanner()}
  <h2 class="section">Currently reading</h2>
  ${readingHtml}

  ${upNext.length ? `<h2 class="section">Up next <a href="#/library" data-act="lib-filter" data-status="toread">See all</a></h2>
  <div class="up-next">${upNext.map((b) => `<a href="#/book/${b.id}" data-nav>${coverHtml(b, 'md')}<span>${esc(b.title)}</span></a>`).join('')}</div>` : ''}

  <h2 class="section">Goals <button data-act="edit-goals">Edit</button></h2>
  <div class="goals two">
    <button class="goal" data-act="edit-goals">${ringHtml(todayMin, g.dailyMinutes, { label: Math.round(todayMin), small: `of ${g.dailyMinutes} min` })}<div class="g-name">Today</div><div class="g-sub">reading</div></button>
    <button class="goal" data-act="edit-goals">${ringHtml(yearDone, g.yearlyBooks, { label: yearDone, small: `of ${g.yearlyBooks}`, cls: 'sky' })}<div class="g-name"><span class="g-year">${now.getFullYear()}</span></div><div class="g-sub">books</div></button>
  </div>
  ${fab('add-book', 'Add a book')}`;
}

function readingCard(b, single) {
  const pct = progressPct(b);
  const active = store.data.active;
  const isActive = active && active.bookId === b.id;
  return `<div class="reading-card ${single ? 'single' : ''}">
    <a class="top" href="#/book/${b.id}" data-nav>
      ${coverHtml(b, 'md')}
      <div class="info">
        <div class="t">${esc(b.title)}</div>
        <div class="muted small">${esc(b.authors || '')}</div>
        <div class="pct-line"><span>${esc(progressText(b))}</span><span class="num">${pct != null && !progressText(b).endsWith('%') ? Math.round(pct) + '%' : ''}</span></div>
        <div class="bar"><i style="width:${pct || 0}%"></i></div>
      </div>
    </a>
    <div class="btn-row">
      ${isActive ? `<a class="btn primary small" href="#/timer" data-nav>${icon('clock')}<span data-clock>${fmtClock(sessionElapsed())}</span></a>`
        : `<button class="btn primary small" data-act="start-session" data-id="${b.id}">${icon('play')}Start session</button>`}
      <button class="btn small" data-act="update-progress" data-id="${b.id}">Update progress</button>
    </div>
  </div>`;
}

// ======================================================================
// Library
// ======================================================================
function filteredBooks() {
  const f = ui.lib;
  const q = f.q.trim().toLowerCase();
  let list = store.data.books.filter((b) => {
    if (f.status !== 'all' && b.status !== f.status) return false;
    if (f.own !== 'all' && b.ownership !== f.own) return false;
    if (f.format !== 'all' && b.format !== f.format) return false;
    if (f.genre !== 'all' && !b.genres.includes(f.genre)) return false;
    if (q && !`${b.title} ${b.subtitle} ${b.authors} ${b.isbn} ${b.genres.join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const by = {
    added: (a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''),
    updated: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''),
    title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    author: (a, b) => (a.authors || '~').localeCompare(b.authors || '~', undefined, { sensitivity: 'base' }),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0),
    custom: byMyOrder,
  }[f.sort] || ((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  list = list.slice().sort(by);
  return list;
}

/** Your drag-and-drop order. Books you haven't placed yet (new ones) go on top, newest first. */
function byMyOrder(a, b) {
  const order = store.data.libraryOrder;
  const ia = order.indexOf(a.id); const ib = order.indexOf(b.id);
  if (ia === -1 && ib === -1) return (b.addedAt || '').localeCompare(a.addedAt || '');
  if (ia === -1) return -1;
  if (ib === -1) return 1;
  return ia - ib;
}

/** Genres your books actually use, in list order (for the library filter). */
function genresInUse() {
  const used = new Set(store.data.books.flatMap((b) => b.genres));
  return genreList().filter((g) => used.has(g));
}

function libraryListHtml() {
  const list = filteredBooks();
  if (!store.data.books.length) {
    return `<div class="empty"><b>No books yet</b>Tap + to scan, search or type in your first book.
      <div><button class="btn primary" data-act="add-book">${icon('plus')}Add a book</button></div></div>`;
  }
  if (!list.length) return `<div class="empty"><b>No matches</b>Try a different search or clear the filters.<div><button class="btn ghost" data-act="clear-filters">Clear filters</button></div></div>`;
  const custom = ui.lib.sort === 'custom';
  return `<div class="muted small" style="margin:0 4px 8px">${plural(list.length, 'book')}${custom ? ' · drag <span class="grip-inline">⠿</span> to arrange' : ''}</div>
    <div class="book-list" id="book-list" data-sort-kind="library">${list.map((b) => bookRow(b, custom ? dragHandle(b.id, b.title) : '')).join('')}</div>`;
}

function viewLibrary() {
  const f = ui.lib;
  const books = store.data.books;
  const count = (s) => books.filter((b) => b.status === s).length;
  const genres = genresInUse();
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
  return `
  <div class="page-head"><h1>Library</h1><span class="sub num">${plural(books.length, 'book')}</span></div>
  ${sampleBanner()}
  <label class="search">${icon('search')}<input id="lib-search" type="search" placeholder="Search title, author, ISBN, genre" value="${esc(f.q)}" autocomplete="off" data-input="lib-search">${clearBtn(f.q)}</label>
  <div class="chips" role="tablist">
    <button class="chip ${f.status === 'all' ? 'on' : ''}" data-act="lib-status" data-status="all">All <span class="count">${books.length}</span></button>
    ${STATUSES.map((s) => `<button class="chip ${f.status === s.id ? 'on' : ''}" data-act="lib-status" data-status="${s.id}">${s.label} <span class="count">${count(s.id)}</span></button>`).join('')}
  </div>
  <div class="filter-row">
    <select id="f-own" class="input compact" data-change="lib-own" aria-label="Ownership">${opt('all', 'Any ownership', f.own)}${OWNERSHIP.map((o) => opt(o, o, f.own)).join('')}</select>
    <select id="f-format" class="input compact" data-change="lib-format" aria-label="Format">${opt('all', 'Any format', f.format)}${FORMATS.map((o) => opt(o, o, f.format)).join('')}</select>
    <select id="f-genre" class="input compact" data-change="lib-genre" aria-label="Genre">${opt('all', 'Any genre', f.genre)}${genres.map((o) => opt(o, o, f.genre)).join('')}</select>
    <select id="f-sort" class="input compact" data-change="lib-sort" aria-label="Sort">${opt('added', 'Recently added', f.sort)}${opt('updated', 'Recently updated', f.sort)}${opt('title', 'Title A–Z', f.sort)}${opt('author', 'Author A–Z', f.sort)}${opt('rating', 'Highest rated', f.sort)}${opt('custom', 'My order (drag)', f.sort)}</select>
  </div>
  <div id="lib-list">${libraryListHtml()}</div>
  ${fab('add-book', 'Add a book')}`;
}

// ======================================================================
// Book detail
// ======================================================================
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);

function notesHtml(b) {
  const notes = b.notes.slice().sort((x, y) => (x.page ?? 1e9) - (y.page ?? 1e9) || x.createdAt.localeCompare(y.createdAt));
  return notes.length ? `<div class="stack">${notes.map((n) => `<div class="note"><div class="n-head">${n.page != null ? `<span class="n-page num">p. ${n.page}</span>` : '<span>Book note</span>'}<span class="faint">${fmtDate(n.createdAt.slice(0, 10))}</span><span class="sp"></span>
      <button data-act="edit-note" data-id="${b.id}" data-note="${n.id}">Edit</button></div><div class="n-text">${esc(n.text)}</div></div>`).join('')}</div>`
    : `<p class="muted small" style="margin:0 4px">Jot down thoughts on the whole book or on a specific page.</p>`;
}

/** This book's own numbers: time, sessions, pages, pace, days, re-reads. */
function bookStatsHtml(b, totals) {
  const logs = totals.logs;
  const sessions = logs.filter((l) => l.type === 'session' && l.seconds > 0);
  const pages = logs.reduce((n, l) => n + (l.pages || 0), 0);
  const days = new Set(logs.map((l) => l.date).filter(Boolean));
  const dates = [...days].sort();
  const finishedTimes = timesFinished(b);
  const tiles = [];
  if (totals.seconds) tiles.push(['Time read', fmtMinutes(totals.seconds / 60).replace(/ min$/, '<small>min</small>').replace(/ h /, '<small>h</small> ').replace(/ h$/, '<small>h</small>')]);
  if (sessions.length) tiles.push(['Sessions', `${sessions.length}`, `avg ${fmtMinutes(sessions.reduce((n, l) => n + l.seconds, 0) / sessions.length / 60)}`]);
  if (pages) tiles.push(['Pages read', pages.toLocaleString()]);
  if (days.size) tiles.push(['Days read', `${days.size}`]);
  if (totals.pagesPerHour) tiles.push(['Your pace', `${Math.round(totals.pagesPerHour)}<small>pages/h</small>`]);
  if (b.status === 'finished' && b.startedAt && b.finishedAt) {
    const d = daysBetween(b.startedAt, b.finishedAt) + 1;
    tiles.push([b.reads.length ? 'This read took' : 'Took', `${d}<small>${d === 1 ? 'day' : 'days'}</small>`]);
  }
  if (finishedTimes > 1) tiles.push(['Times read', `${finishedTimes}`]);
  const past = b.reads.map((r, i) => `<div class="past-read"><span class="num">${ordinal(i + 1)} read</span><span>${r.startedAt ? fmtDate(r.startedAt) : '?'} – ${r.finishedAt ? fmtDate(r.finishedAt) : '?'}</span><span class="faint">${r.status === 'dnf' ? 'did not finish' : 'finished'}</span></div>`).join('');
  return `${tiles.length ? `<div class="stat-grid book-stats">${tiles.map(([k, v, d]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div>${d ? `<div class="d">${esc(d)}</div>` : ''}</div>`).join('')}</div>`
      : '<p class="muted small" style="margin:0 4px">Start a session or update your progress, and this book\'s reading time, pace and more show up here.</p>'}
    ${dates.length ? `<p class="faint small" style="margin:10px 4px 0">${dates.length > 1 ? `Read between ${fmtDate(dates[0])} and ${fmtDate(dates[dates.length - 1])}` : `Read on ${fmtDate(dates[0])}`}</p>` : ''}
    ${past ? `<div class="past-reads">${past}</div>` : ''}`;
}

function viewBook(id) {
  const b = getBook(id);
  if (!b) return `<div class="page-head">${backBtn('#/library')}<h1>Not found</h1></div><div class="empty"><b>This book isn't in your library</b>It may have been deleted.</div>`;
  const pct = progressPct(b);
  const totals = bookTotals(b.id);
  const sp = speed();
  const pageNow = pagePos(b);
  const remaining = b.pages && pageNow != null ? b.pages - pageNow : null;
  const pace = totals.pagesPerHour || sp.pagesPerHour;
  const active = store.data.active;
  const isActive = active && active.bookId === b.id;
  const colls = collectionsOf(b.id);
  const logs = totals.logs.slice().sort((x, y) => (y.startedAt || y.date).localeCompare(x.startedAt || x.date));
  const aboutOpen = ui.aboutOpen[b.id];
  const done = b.status === 'finished' || b.status === 'dnf';
  const readNo = b.reads.length + 1;
  const notesSection = `<h2 class="section"><span>Notes${b.notes.length ? ` <span class="count-badge">${b.notes.length}</span>` : ''}</span> <button data-act="add-note" data-id="${b.id}">Add note</button></h2>${notesHtml(b)}`;
  const long = (v) => String(v || '').length > 16;

  return `
  <div class="page-head">${backBtn('#/library')}<div style="flex:1"></div>
    <button class="icon-btn" data-act="edit-book" data-id="${b.id}" aria-label="Edit book">${icon('pen')}</button></div>

  <div class="detail-hero">
    ${coverHtml(b, 'lg')}
    <div class="info">
      <h1>${esc(b.title)}</h1>
      ${b.subtitle ? `<div class="subtitle">${esc(b.subtitle)}</div>` : ''}
      <div class="author">${esc(b.authors || 'Unknown author')}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px">${starsHtml(b.rating, { size: 'md' })}<span class="muted small num">${b.rating ? fmtRating(b.rating) : 'Not rated'}</span></div>
      ${b.reads.length ? `<span class="pill reread" style="align-self:flex-start;margin-top:6px">${b.status === 'finished' ? `Read ${timesFinished(b)} times` : `${ordinal(readNo)} read`}</span>` : ''}
    </div>
  </div>

  <div class="status-picker" role="radiogroup" aria-label="Reading status">
    ${STATUSES.map((s) => `<button role="radio" aria-checked="${b.status === s.id}" class="${b.status === s.id ? 'on' : ''}" style="--c:var(--st-${s.id})" data-act="set-status" data-id="${b.id}" data-status="${s.id}"><span class="dot"></span>${s.label}</button>`).join('')}
  </div>

  ${b.notes.length ? notesSection : ''}

  <h2 class="section">Progress</h2>
  <div class="card stack">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
      <b>${esc(progressText(b))}</b><span class="num muted">${pct != null && !progressText(b).endsWith('%') ? Math.round(pct) + '%' : (b.pages && pageNow != null && b.status !== 'finished' ? `≈ p. ${pageNow} of ${b.pages}` : '')}</span>
    </div>
    <div class="bar"><i style="width:${pct || 0}%"></i></div>
    <div class="muted small">${[
      remaining > 0 && pace && !done ? `about ${fmtMinutes(remaining / pace * 60)} left at your pace` : '',
      b.startedAt ? `started ${fmtDate(b.startedAt)}` : '',
      b.finishedAt ? `finished ${fmtDate(b.finishedAt)}` : '',
    ].filter(Boolean).join(' · ') || 'No reading logged yet'}</div>
    <div class="btn-row stacked">
      ${done ? `<button class="btn primary" data-act="start-reread" data-id="${b.id}">${icon('refresh')}Read it again</button>`
        : isActive ? `<a class="btn primary" href="#/timer" data-nav>${icon('clock')}<span data-clock>${fmtClock(sessionElapsed())}</span></a>`
        : `<button class="btn primary" data-act="start-session" data-id="${b.id}">${icon('play')}Start reading session</button>`}
      ${done ? '' : `<button class="btn" data-act="update-progress" data-id="${b.id}">Update progress</button>`}
    </div>
  </div>

  <h2 class="section">Your stats</h2>
  ${bookStatsHtml(b, totals)}

  <h2 class="section">Your rating</h2>
  <div class="card">
    <div class="rating-box">
      ${starsHtml(b.rating, { size: 'lg', rateId: b.id })}
      <span class="rating-val" data-rating-val>${fmtRating(b.rating)}</span>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;flex-wrap:wrap">
      <span class="muted small">Tap or drag across the stars. Quarter stars count.</span>
      <div class="rate-steps">
        <button class="btn small ghost" data-act="rate-step" data-id="${b.id}" data-d="-0.25" aria-label="Lower rating by a quarter star">−¼</button>
        <button class="btn small ghost" data-act="rate-step" data-id="${b.id}" data-d="0.25" aria-label="Raise rating by a quarter star">+¼</button>
        ${b.rating ? `<button class="btn small ghost" data-act="rate-clear" data-id="${b.id}">Clear</button>` : ''}
      </div>
    </div>
  </div>

  <h2 class="section">About</h2>
  ${b.about ? `<div class="card"><div class="about ${aboutOpen ? '' : 'clamp'}">${esc(b.about)}</div>
    ${b.about.length > 320 ? `<button class="link-btn" data-act="toggle-about" data-id="${b.id}">${aboutOpen ? 'Show less' : 'Read more'}</button>` : ''}</div>`
    : `<div class="empty" style="padding:22px"><span>No description yet.</span><div class="btn-row" style="justify-content:center;margin-top:12px">
       <button class="btn small" data-act="fill-details" data-id="${b.id}">${icon('refresh')}Look it up</button>
       <button class="btn small ghost" data-act="edit-book" data-id="${b.id}">Write one</button></div></div>`}

  <h2 class="section">Details</h2>
  <div class="facts">
    <button class="fact" data-act="edit-book" data-id="${b.id}"><div class="k">Pages</div><div class="v num">${b.pages || 'Add'}</div></button>
    <button class="fact" data-act="quick-pick" data-field="format" data-id="${b.id}"><div class="k">Format</div><div class="v">${esc(b.format)}</div></button>
    <button class="fact" data-act="quick-pick" data-field="ownership" data-id="${b.id}"><div class="k">Ownership</div><div class="v">${esc(b.ownership)}</div></button>
    ${b.published ? `<div class="fact ${long(b.published) ? 'wide' : ''}"><div class="k">Published</div><div class="v">${esc(b.published)}</div></div>` : ''}
    ${b.isbn ? `<div class="fact"><div class="k">ISBN</div><div class="v num">${esc(b.isbn)}</div></div>` : ''}
    ${b.publisher ? `<div class="fact ${long(b.publisher) ? 'wide' : ''}"><div class="k">Publisher</div><div class="v">${esc(b.publisher)}</div></div>` : ''}
    <button class="fact wide" data-act="pick-genres" data-id="${b.id}"><div class="k">Genre</div><div class="v">${esc(b.genres.join(', ') || 'Add')}</div></button>
  </div>
  <div class="ext-links">
    <span class="faint small">Check details on</span>
    <a class="btn small ghost" href="https://www.goodreads.com/search?q=${encodeURIComponent(b.isbn || `${b.title} ${b.authors}`)}" target="_blank" rel="noopener">Goodreads</a>
    <a class="btn small ghost" href="https://www.amazon.com/s?i=stripbooks&k=${encodeURIComponent(b.isbn || `${b.title} ${b.authors}`)}" target="_blank" rel="noopener">Amazon</a>
  </div>

  <h2 class="section">Collections <button data-act="pick-collections" data-id="${b.id}">${colls.length ? 'Change' : 'Add'}</button></h2>
  ${colls.length ? `<div class="chip-wrap">${colls.map((c) => `<a class="chip" href="#/collection/${c.id}" data-nav><span class="pill dot" style="width:10px;height:10px;padding:0;border-radius:50%;background:${esc(c.color)}"></span>${esc(c.name)}</a>`).join('')}</div>`
    : `<p class="muted small" style="margin:0 4px">Not in any collection yet.</p>`}

  ${b.notes.length ? '' : notesSection}

  <h2 class="section">Reading history <button data-act="update-progress" data-id="${b.id}" data-past="1">Log past reading</button></h2>
  ${logs.length ? `<div class="stack">${logs.map((l) => logRow(l)).join('')}</div>` : `<p class="muted small" style="margin:0 4px">Sessions and page updates show up here.</p>`}
  `;
}

function logRow(l) {
  const parts = [];
  if (l.seconds) parts.push(fmtMinutes(l.seconds / 60));
  if (l.pages) parts.push(plural(l.pages, 'page'));
  else if (l.toPct != null && l.fromPct != null && l.toPct !== l.fromPct) parts.push(`${Math.round(l.fromPct)}% → ${Math.round(l.toPct)}%`);
  const when = l.startedAt ? `${fmtDate(l.date)}, ${new Date(l.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : fmtDate(l.date);
  return `<div class="log-row"><div class="ic">${icon(l.type === 'session' ? 'clock' : 'book')}</div>
    <div class="info"><b>${esc(parts.join(' · ') || 'Logged')}</b><div class="muted small">${esc(when)}${l.toPage != null ? ` · to p. ${l.toPage}` : ''}</div></div>
    <button class="del" data-act="delete-log" data-log="${l.id}" aria-label="Delete entry">${icon('trash')}</button></div>`;
}

// ======================================================================
// Collections
// ======================================================================
function collStack(c) {
  const books = c.bookIds.map(getBook).filter(Boolean).slice(0, 3);
  return `<div class="coll-stack" style="--c:${esc(c.color)}">${books.map((b) => coverHtml(b, 'sm')).join('')}</div>`;
}
const dragHandle = (id, title) => `<button class="drag-handle" data-act="drag-noop" aria-label="Drag to move ${esc(title)}">${icon('grip')}</button>`;
const sortSelect = (id, cur, options) => `<select id="${id}" class="input compact sort-select" aria-label="Sort">${options.map(([v, label]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;

const COLL_SORTS = [['custom', 'My order (drag)'], ['name', 'Name A–Z'], ['count', 'Most books'], ['recent', 'Newest first']];
function sortedCollections() {
  const cs = store.data.collections.slice();
  const count = (c) => c.bookIds.filter(getBook).length;
  const by = {
    name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    count: (a, b) => count(b) - count(a) || a.name.localeCompare(b.name),
    recent: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
  }[store.data.settings.collectionsSort];
  return by ? cs.sort(by) : cs; // 'custom' is the saved order of the list itself
}

function viewCollections() {
  const cs = sortedCollections();
  const sort = store.data.settings.collectionsSort || 'custom';
  const custom = sort === 'custom' && cs.length > 1;
  return `
  <div class="page-head"><h1>Collections</h1><span class="sub num">${plural(cs.length, 'collection')}</span></div>
  ${cs.length > 1 ? `<div class="sort-row"><span class="muted small">${custom ? 'Drag <span class="grip-inline">⠿</span> to arrange' : 'Sorted by'}</span>${sortSelect('coll-sort', sort, COLL_SORTS)}</div>` : ''}
  ${cs.length ? `<div class="coll-grid" data-sort-kind="collections">${cs.map((c) => `<a class="coll-card" href="#/collection/${c.id}" data-nav data-id="${c.id}">${collStack(c)}
      <div class="coll-meta"><div><div class="n">${esc(c.name)}</div><div class="c">${plural(c.bookIds.filter(getBook).length, 'book')}</div></div>${custom ? dragHandle(c.id, c.name) : ''}</div></a>`).join('')}</div>`
    : `<div class="empty"><b>Group books your way</b>Make collections like "Summer 2026", "Book club" or "Signed copies". A book can be in as many as you like.
      <div><button class="btn primary" data-act="new-collection">${icon('plus')}New collection</button></div></div>`}
  ${fab('new-collection', 'New collection')}`;
}

const BOOK_SORTS = [['custom', 'My order (drag)'], ['title', 'Title A–Z'], ['author', 'Author A–Z'], ['added', 'Recently added'], ['rating', 'Highest rated'], ['status', 'Reading status']];
function sortedCollectionBooks(c) {
  const books = c.bookIds.map(getBook).filter(Boolean);
  const statusRank = (b) => ['reading', 'toread', 'wishlist', 'finished', 'dnf'].indexOf(b.status);
  const by = {
    title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    author: (a, b) => (a.authors || '~').localeCompare(b.authors || '~', undefined, { sensitivity: 'base' }),
    added: (a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0),
    status: (a, b) => statusRank(a) - statusRank(b) || a.title.localeCompare(b.title),
  }[c.sort];
  return by ? books.sort(by) : books; // 'custom' is the order of the collection itself
}

function viewCollection(id) {
  const c = getCollection(id);
  if (!c) return `<div class="page-head">${backBtn('#/collections')}<h1>Not found</h1></div>`;
  const books = sortedCollectionBooks(c);
  const sort = c.sort || 'custom';
  const custom = sort === 'custom' && books.length > 1;
  const remove = (b) => `<button class="icon-btn row-remove" data-act="coll-remove" data-coll="${c.id}" data-id="${b.id}" aria-label="Remove from collection">${icon('close')}</button>`;
  return `
  <div class="page-head">${backBtn('#/collections')}<div style="flex:1"></div>
    <button class="icon-btn" data-act="edit-collection" data-id="${c.id}" aria-label="Edit collection">${icon('pen')}</button></div>
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px"><span style="width:14px;height:14px;border-radius:50%;background:${esc(c.color)};flex:none"></span>
    <h1 class="book-title" style="font-size:28px;margin:0;line-height:1.15">${esc(c.name)}</h1></div>
  ${c.description ? `<p class="muted" style="margin:0 0 6px">${esc(c.description)}</p>` : ''}
  <div class="sort-row"><span class="faint small">${plural(books.length, 'book')}${custom ? ' · drag <span class="grip-inline">⠿</span> to arrange' : ''}</span>${books.length > 1 ? sortSelect('cbook-sort', sort, BOOK_SORTS) : ''}</div>
  ${books.length ? `<div class="book-list" data-sort-kind="collection" data-coll="${c.id}">${books.map((b) => bookRow(b, `${remove(b)}${custom ? dragHandle(b.id, b.title) : ''}`)).join('')}</div>`
    : `<div class="empty"><b>Empty for now</b>Add books from your library.<div><button class="btn primary" data-act="coll-add-books" data-id="${c.id}">${icon('plus')}Add books</button></div></div>`}
  ${fab('coll-add-books', 'Add books', `data-id="${c.id}"`)}`;
}

// ======================================================================
// Stats
// ======================================================================
function viewStats() {
  const days = byDay();
  const st = streaks(days);
  const sp = speed();
  const now = new Date();
  if (!ui.cal) ui.cal = { y: now.getFullYear(), m: now.getMonth(), sel: todayKey() };
  const { y, m, sel } = ui.cal;
  const yt = yearTotals(now.getFullYear());
  const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}-`;
  const daysThisMonth = [...days.keys()].filter((k) => k.startsWith(monthPrefix)).length;

  // calendar grid (Sunday first)
  const first = new Date(y, m, 1);
  const nDays = new Date(y, m + 1, 0).getDate();
  const tk = todayKey();
  let cells = '';
  for (let i = 0; i < first.getDay(); i++) cells += '<span class="cal-day blank"></span>';
  for (let dnum = 1; dnum <= nDays; dnum++) {
    const k = `${monthPrefix}${String(dnum).padStart(2, '0')}`;
    const day = days.get(k);
    const lvl = day ? heatLevel(day, store.data.goals.dailyMinutes) : 0;
    const label = day ? `${fmtDate(k)}: ${day.seconds ? fmtMinutes(day.seconds / 60) : ''}${day.pages ? ` ${day.pages} pages` : ''}` : `${fmtDate(k)}: no reading`;
    cells += `<button class="cal-day ${lvl ? 'l' + lvl : ''} ${k === tk ? 'today' : ''} ${k === sel ? 'sel' : ''} ${k > tk ? 'future' : ''}" data-act="cal-day" data-key="${k}" aria-label="${esc(label)}">${dnum}</button>`;
  }
  const monthName = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const selDay = days.get(sel);
  const dayBooks = selDay ? [...selDay.books.entries()].map(([id, v]) => ({ b: getBook(id), ...v })).filter((x) => x.b) : [];

  const maxBar = Math.max(1, ...yt.perMonth);
  const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'narrow' }));

  return `
  <div class="page-head"><h1>Stats</h1></div>
  <div class="stat-grid">
    <div class="stat hero"><div class="flame">${icon('flame')}</div>
      <div><div class="k">Current streak</div><div class="v">${st.current}<small>${st.current === 1 ? 'day' : 'days'}</small></div>
      <div class="d">${st.current && !st.readToday ? 'Read today to keep it going' : (st.readToday ? 'You read today' : 'Read today to start one')}</div></div></div>
    <div class="stat"><div class="k">Longest streak</div><div class="v">${st.longest}<small>days</small></div></div>
    <div class="stat"><div class="k">Days read</div><div class="v">${daysThisMonth}<small>in ${esc(first.toLocaleDateString(undefined, { month: 'short' }))}</small></div></div>
  </div>

  <h2 class="section">Reading calendar</h2>
  <div class="cal">
    <div class="cal-head"><button class="icon-btn" data-act="cal-move" data-d="-1" aria-label="Previous month">${icon('left')}</button>
      <b>${esc(monthName)}</b><button class="icon-btn" data-act="cal-move" data-d="1" aria-label="Next month">${icon('right')}</button></div>
    <div class="cal-grid">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<span class="cal-dow">${d}</span>`).join('')}${cells}</div>
    <div class="cal-legend"><span>Less</span><i style="background:var(--heat-0)"></i><i style="background:var(--heat-1)"></i><i style="background:var(--heat-2)"></i><i style="background:var(--heat-3)"></i><i style="background:var(--heat-4)"></i><span>Daily goal met</span></div>
    <div class="day-detail">
      <div class="dd-head"><b>${esc(fmtDate(sel, { weekday: 'long', month: 'long', day: 'numeric' }))}</b>
        <span class="muted small num">${selDay ? [selDay.seconds ? fmtMinutes(selDay.seconds / 60) : '', selDay.pages ? plural(selDay.pages, 'page') : ''].filter(Boolean).join(' · ') : ''}</span></div>
      ${dayBooks.length ? dayBooks.map((x) => `<a class="day-book" href="#/book/${x.b.id}" data-nav>${coverHtml(x.b, 'xs')}<div class="info"><div class="t">${esc(x.b.title)}</div>
        <div class="muted small">${[x.seconds ? fmtMinutes(x.seconds / 60) : '', x.pages ? plural(x.pages, 'page') : ''].filter(Boolean).join(' · ') || 'Progress updated'}</div></div></a>`).join('')
        : '<span class="muted small">No reading logged this day.</span>'}
    </div>
  </div>

  <h2 class="section">Reading speed</h2>
  <div class="stat-grid">
    <div class="stat"><div class="k">Average</div><div class="v">${sp.pagesPerHour ? Math.round(sp.pagesPerHour) : '–'}<small>pages/hour</small></div>
      <div class="d">${sp.minutesPerPage ? `${sp.minutesPerPage.toFixed(1)} min per page` : 'Time a session to measure'}</div></div>
    <div class="stat"><div class="k">Avg session</div><div class="v">${sp.avgSessionMin ? Math.round(sp.avgSessionMin) : '–'}<small>min</small></div><div class="d">${plural(sp.sessions, 'session')} timed</div></div>
  </div>

  <h2 class="section">${now.getFullYear()} so far</h2>
  <div class="stat-grid">
    <div class="stat"><div class="k">Books finished</div><div class="v">${yt.finished}<small>of ${yearlyGoal()}</small></div></div>
    <div class="stat"><div class="k">Pages read</div><div class="v">${yt.pages.toLocaleString()}</div></div>
    <div class="stat"><div class="k">Time reading</div><div class="v">${Math.round(yt.seconds / 3600)}<small>hours</small></div></div>
    <div class="stat"><div class="k">Avg rating</div><div class="v">${yt.avgRating ? fmtRating(Math.round(yt.avgRating * 4) / 4) : '–'}<small>${yt.avgRating ? 'stars' : ''}</small></div></div>
  </div>
  <div class="card" style="margin-top:12px">
    <div class="eyebrow">Books finished per month</div>
    <div class="bars" role="img" aria-label="Books finished per month in ${now.getFullYear()}">${yt.perMonth.map((n, i) => `<div class="b" title="${esc(new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'long' }))}: ${plural(n, 'book')}">${n ? `<em>${n}</em>` : ''}<i class="${n ? '' : 'zero'}" style="height:${n ? Math.max(6, (n / maxBar) * 100) : 3}%"></i></div>`).join('')}</div>
    <div class="bars-x">${months.map((mm, i) => `<span class="${i === now.getMonth() ? 'cur' : ''}">${esc(mm)}</span>`).join('')}</div>
  </div>`;
}

// ======================================================================
// Settings
// ======================================================================
function viewSettings() {
  loadWidgetScript().catch(() => { widgetScript = null; });
  const d = store.data;
  const g = d.goals;
  return `
  <div class="page-head"><h1>Settings</h1></div>
  <h2 class="section">You</h2>
  <div class="settings-list">
    <button data-act="edit-name"><span class="grow">Your name</span><span class="val">${d.settings.name ? esc(d.settings.name) : 'Add'}</span></button>
  </div>

  <h2 class="section">Search</h2>
  <div class="settings-list">
    <label class="settings-toggle"><span class="grow">English editions only<br><span class="faint small">Search and lookups stick to English books</span></span>
      <span class="switch"><input type="checkbox" data-change="english-only" ${d.settings.englishOnly !== false ? 'checked' : ''}><i></i></span></label>
  </div>

  <h2 class="section">Reading goals</h2>
  <div class="settings-list">
    <button data-act="edit-goals"><span class="grow">Daily reading time</span><span class="val num">${g.dailyMinutes} min</span></button>
    <button data-act="edit-goals"><span class="grow">Books per year</span><span class="val num">${g.yearlyBooks}</span></button>
  </div>

  <h2 class="section">iPhone widget</h2>
  <div class="card small muted widget-help">
    <p>Put your current book and goals on your Home Screen. Apple only lets App Store apps make widgets, so Lamplight's widget runs inside the free <b>Scriptable</b> app.</p>
    <ol>
      <li>Install <b>Scriptable</b> from the App Store.</li>
      <li>Tap <b>Copy widget script</b> below. In Scriptable tap <b>+</b>, paste, then tap the title and name it exactly <b>Lamplight Widget</b>.</li>
      <li>On your Home Screen, add a <b>Scriptable</b> widget (any size). Long-press it, choose <b>Edit Widget</b>, and set Script to <b>Lamplight Widget</b>.</li>
      <li>Back here, tap <b>Update widget</b>. Do this whenever you want fresh numbers; Lamplight also offers it after you save progress.</li>
    </ol>
  </div>
  <div class="settings-list" style="margin-top:12px">
    <button data-act="copy-widget"><span class="grow">Copy widget script</span><span class="val">Step 2</span></button>
    <button data-act="update-widget"><span class="grow">Update widget</span><span class="val">${d.settings.widgetUpdated ? `Last: ${esc(fmtDate(d.settings.widgetUpdated.slice(0, 10)))}` : 'Never'}</span></button>
  </div>

  <h2 class="section">Backup</h2>
  <div class="callout"><b>Your library lives only on this phone.</b> Save a backup to iCloud Drive or Files now and then, so a new phone or a deleted app doesn't mean starting over.</div>
  <div class="settings-list" style="margin-top:12px">
    <button data-act="export"><span class="grow">Save a backup</span><span class="val">${d.settings.lastBackup ? `Last: ${esc(fmtDate(d.settings.lastBackup.slice(0, 10)))}` : 'Never'}</span></button>
    <label style="cursor:pointer"><span class="grow">Restore from a backup</span><span class="val">Choose file</span>
      <input type="file" id="import-file" accept="application/json,.json" data-change="import" hidden></label>
  </div>

  <h2 class="section">Storage</h2>
  <div class="settings-list">
    <div><span class="grow">Books</span><span class="val num">${d.books.length}</span></div>
    <div><span class="grow">Reading entries</span><span class="val num">${d.logs.length}</span></div>
    <div><span class="grow">Protected from clean-up</span><span class="val" id="persist-state">Checking…</span></div>
  </div>

  <h2 class="section">Install on iPhone</h2>
  <div class="card small muted" style="line-height:1.6">Open this page in <b style="color:var(--text)">Safari</b>, tap the <b style="color:var(--text)">Share</b> button, then <b style="color:var(--text)">Add to Home Screen</b>. Launch it from the new icon and it runs full screen and offline.</div>

  <h2 class="section">Examples & reset</h2>
  <div class="settings-list">
    ${hasSamples() ? '<button data-act="remove-samples"><span class="grow">Remove example books</span></button>' : '<button data-act="load-samples"><span class="grow">Add example books</span></button>'}
    <button data-act="erase-all"><span class="grow red">Erase everything</span></button>
  </div>

  <p class="faint small" style="text-align:center;margin-top:28px;line-height:1.6">Lamplight ${APP_VERSION}<br>Book details from Google Books and Open Library.<br>Barcode scanning by html5-qrcode (Apache 2.0).</p>`;
}

async function showPersistState() {
  const el = document.getElementById('persist-state');
  if (!el) return;
  try {
    const p = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    el.textContent = p ? 'Yes' : 'Ask again';
    if (!p) { el.style.color = 'var(--gold)'; el.style.cursor = 'pointer'; el.onclick = requestPersist; }
  } catch (e) { el.textContent = 'Unknown'; }
}
async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const ok = await navigator.storage.persist();
      const el = document.getElementById('persist-state');
      if (el) el.textContent = ok ? 'Yes' : 'Not granted';
    }
  } catch (e) { /* not supported */ }
}

// ======================================================================
// Timer (reading session)
// ======================================================================
function viewTimer() {
  const a = store.data.active;
  const b = a && getBook(a.bookId);
  if (!a || !b) {
    return `<div class="page-head">${backBtn('#/home')}<h1>Reading session</h1></div>
      <div class="empty"><b>No session running</b>Start one from any book you're reading.<div><a class="btn primary" href="#/library" data-nav>Go to library</a></div></div>`;
  }
  const started = new Date(a.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `<div class="page-head">${backBtn('#/home')}<div style="flex:1"></div></div>
  <div class="timer-view">
    ${coverHtml(b, 'lg')}
    <h2>${esc(b.title)}</h2>
    <div class="timer-clock" data-clock>${fmtClock(sessionElapsed())}</div>
    <div class="muted">Started ${esc(started)}${a.startPage != null ? ` · from p. ${a.startPage}` : (a.startPct != null ? ` · from ${Math.round(a.startPct)}%` : '')}${a.pausedAt ? ' · paused' : ''}</div>
    <div class="btn-row">
      ${a.pausedAt ? `<button class="btn big" data-act="timer-resume">${icon('play')}Resume</button>` : `<button class="btn big" data-act="timer-pause">${icon('pause')}Pause</button>`}
      <button class="btn primary big" data-act="timer-finish">${icon('stop')}Finish</button>
    </div>
    <label class="toggle-line"><span><b>Keep screen on</b><br><span class="muted small">Stops the phone from dimming while you read</span></span>
      <span class="switch"><input type="checkbox" id="wake-toggle" data-change="wake" ${ui.wantWake ? 'checked' : ''}><i></i></span></label>
    <button class="link-btn" data-act="timer-cancel" style="color:var(--faint)">Discard this session</button>
  </div>`;
}

function renderTimerBar() {
  const a = store.data.active;
  const b = a && getBook(a.bookId);
  const show = !!(a && b && ui.route.name !== 'timer');
  document.body.classList.toggle('timer-on', show);
  timerBar.hidden = !show;
  if (!show) return;
  timerBar.classList.toggle('paused', !!a.pausedAt);
  timerBar.innerHTML = `<span class="tb-dot"></span><a class="tb-title" href="#/timer" data-nav>${esc(b.title)}</a>
    <span class="tb-time" data-clock>${fmtClock(sessionElapsed())}</span>
    <button data-act="timer-finish">Finish</button>`;
}

function tick() {
  if (!store.data.active) return;
  const t = fmtClock(sessionElapsed());
  document.querySelectorAll('[data-clock]').forEach((el) => { if (el.textContent !== t) el.textContent = t; });
}
setInterval(tick, 1000);

async function setWake(on) {
  ui.wantWake = on;
  try {
    if (on && 'wakeLock' in navigator) {
      ui.wakeLock = await navigator.wakeLock.request('screen');
    } else if (!on && ui.wakeLock) {
      await ui.wakeLock.release(); ui.wakeLock = null;
    }
  } catch (e) {
    if (on) toast("This phone didn't allow keeping the screen on.");
  }
}

// ======================================================================
// Sheets: add book (scan / search / manual)
// ======================================================================
function addBookSheet() {
  openSheet(`${sheetHead('Add a book')}
    <div class="option-list">
      <button class="option" data-act="open-scan"><span class="ic">${icon('scan')}</span><span><b>Scan barcode or QR code</b><small>Point the camera at the back cover. Turn on Keep scanning to add a whole shelf.</small></span></button>
      <button class="option" data-act="open-search"><span class="ic">${icon('search')}</span><span><b>Search</b><small>By title, author, series or ISBN. Add several at once.</small></span></button>
      <button class="option" data-act="open-manual"><span class="ic">${icon('type')}</span><span><b>Type it in</b><small>Fill in the details yourself</small></span></button>
    </div>
    ${isOnline() ? '' : '<p class="muted small" style="margin:14px 4px 0">You\'re offline. Scanning still saves the ISBN, and you can fetch the details later.</p>'}`);
}

// ---------- quick add (several books in a row) ----------
const normText = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** Same ISBN, or same title and first author, already in the library. */
function findDuplicate(r) {
  const byIsbn = findByIsbn(r.isbn);
  if (byIsbn) return byIsbn;
  const t = normText(r.title); const a = normText(String(r.authors || '').split(',')[0]);
  return t ? store.data.books.find((b) => normText(b.title) === t && normText(String(b.authors || '').split(',')[0]) === a) || null : null;
}
const statusSelect = (id) => `<select class="input compact" id="${id}" aria-label="Add as">${STATUSES.map((st) => `<option value="${st.id}" ${st.id === ui.qaStatus ? 'selected' : ''}>${esc(st.label)}</option>`).join('')}</select>`;

// ======================================================================
// Search (its own tab)
// ======================================================================
// Results live in ui.search, so they stay put while you check a book's details,
// add a few, or switch tabs and come back.
const englishOnly = () => store.data.settings.englishOnly !== false;

function searchResultsHtml() {
  const S = ui.search;
  if (S.state === 'loading') return '<div class="spinner"></div>';
  if (S.state === 'error') return `<p class="muted">${esc(S.error)} Check your connection and try again.</p>`;
  if (S.state === 'offline') return `<p class="muted">You're offline, so search can't reach the book databases. <button class="link-btn" data-act="open-manual">Type it in instead</button></p>`;
  if (S.state === 'empty') return `<p class="muted">No books found for "${esc(S.lastQ)}". <button class="link-btn" data-act="manual-from-search">Add it by hand</button></p>`;
  if (S.state !== 'done') {
    return `<div class="search-hints">
      <p><b>Find any book</b> by title, author, series or ISBN.</p>
      <p>Tap <b>+</b> to add a book straight away, or tap the book to check its details first. Adding a series? Search its name and tap + on each book.</p>
      ${englishOnly() ? '<p class="faint small">Showing English editions. You can change this in Settings.</p>' : ''}
    </div>`;
  }
  return S.results.map((r, i) => {
    const have = !!findDuplicate(r);
    const busy = S.busy.has(i);
    return `<div class="result">
      <button type="button" class="result-main" data-act="pick-result" data-i="${i}">${coverHtml(r, 'sm')}<div class="info"><div class="t">${esc(r.title)}</div>
        <div class="muted small">${esc(r.authors || 'Unknown author')}${r.published ? ` · ${esc(String(r.published).slice(0, 4))}` : ''}</div>
        <div class="faint small">${[r.pages ? `${r.pages} pages` : '', r.isbn ? `ISBN ${esc(r.isbn)}` : ''].filter(Boolean).join(' · ')}</div></div></button>
      <button type="button" class="qa-btn ${have ? 'done' : ''} ${busy ? 'busy' : ''}" data-act="quick-add" data-i="${i}" aria-label="${have ? 'In your library' : `Quick add ${esc(r.title)}`}" ${have || busy ? 'disabled' : ''}>${busy ? '<span class="mini-spin"></span>' : icon(have ? 'check' : 'plus')}</button>
    </div>`;
  }).join('') + `<button class="link-btn" data-act="manual-from-search" style="align-self:center">Not here? Add it by hand</button>`;
}

function viewSearch() {
  return `
  <div class="page-head"><h1>Search</h1></div>
  <form id="search-form" autocomplete="off">
    <label class="search">${icon('search')}<input id="search-q" type="search" placeholder="Title, author, series or ISBN" value="${esc(ui.search.q)}" enterkeyhint="search" data-input="search-q">${clearBtn(ui.search.q)}</label>
  </form>
  <div class="search-tools">
    <button class="btn small" data-act="open-scan">${icon('scan')}Scan barcode</button>
    <button class="btn small ghost" data-act="open-manual">${icon('type')}Type it in</button>
  </div>
  <div class="qa-bar"><span class="muted small">Tap <b>+</b> to add as</span>${statusSelect('qa-status')}</div>
  <div id="search-results" class="stack">${searchResultsHtml()}</div>`;
}

const refreshResults = () => { const el = document.getElementById('search-results'); if (el) el.innerHTML = searchResultsHtml(); };

let searchToken = 0;
async function runSearch() {
  const q = ui.search.q.trim();
  if (!q) return;
  const token = ++searchToken;
  ui.search.lastQ = q;
  ui.search.busy = new Set();
  if (!isOnline()) { ui.search.state = 'offline'; refreshResults(); return; }
  ui.search.state = 'loading'; refreshResults();
  try {
    const results = await searchBooks(q, { englishOnly: englishOnly() });
    if (token !== searchToken) return;
    ui.search.results = results;
    ui.search.state = results.length ? 'done' : 'empty';
  } catch (e) {
    if (token !== searchToken) return;
    ui.search.state = 'error'; ui.search.error = e.message;
  }
  refreshResults();
}

async function quickAddResult(i) {
  const r = ui.search.results[i];
  if (!r || ui.search.busy.has(i)) return;
  const dup = findDuplicate(r);
  if (dup) { toast(`"${dup.title}" is already in your library`); return; }
  ui.search.busy.add(i); refreshResults();
  let full = r;
  try { full = await completeResult(r, { englishOnly: englishOnly() }); } catch (e) { /* keep what the search gave us */ }
  const book = addBook({ ...applyEdition(full), status: ui.qaStatus });
  requestPersist();
  ui.search.busy.delete(i); refreshResults();
  toast(`Added "${book.title}"`, { action: 'View', onAction: () => go(`#/book/${book.id}`) });
}

async function pickResult(i, btn) {
  const r = ui.search.results[i];
  if (!r) return;
  const existing = findDuplicate(r);
  if (existing) { go(`#/book/${existing.id}`); return; }
  if (btn) btn.style.opacity = '.5';
  let full = r;
  try { full = await completeResult(r, { englishOnly: englishOnly() }); } catch (e) { /* keep what we have */ }
  if (btn) btn.style.opacity = '';
  // the form opens over the results; closing or saving it brings you straight back
  bookFormSheet(full, { isNew: true, fromDb: true, stay: true });
}

function scanSheet() {
  let handled = false;
  const addedTitles = [];
  const sheet = openSheet(`${sheetHead('Scan a book')}
    <div class="scan-box"><div id="reader"></div><div class="scan-hint" id="scan-hint">Line the barcode up inside the box</div></div>
    <p class="scan-status" id="scan-status">Starting camera…</p>
    <label class="toggle-line scan-keep"><span><b>Keep scanning</b><br><span class="muted small">Adds each book straight away, then scans the next</span></span>
      <span class="switch"><input type="checkbox" id="keep-scan" ${ui.keepScanning ? 'checked' : ''}><i></i></span></label>
    <div class="qa-bar" id="keep-status" ${ui.keepScanning ? '' : 'hidden'}><span class="muted small">Add as</span>${statusSelect('scan-qa-status')}</div>
    <div id="scan-added" class="scan-added" hidden></div>
    <form id="isbn-form" class="form" style="flex-direction:row;gap:8px" autocomplete="off">
      <input id="isbn-input" class="input" inputmode="numeric" placeholder="Or type the ISBN" style="flex:1">
      <button class="btn primary" type="submit">Look up</button>
    </form>
    <label class="btn ghost block" style="margin-top:10px">${icon('photo')}Scan from a photo instead<input type="file" id="scan-photo" accept="image/*" hidden></label>`,
  { onClose: () => { stopScanner(); if (addedTitles.length) toast(`Added ${plural(addedTitles.length, 'book')}`); } });
  const status = sheet.querySelector('#scan-status');
  const keep = () => sheet.querySelector('#keep-scan').checked;
  sheet.querySelector('#keep-scan').addEventListener('change', (e) => {
    ui.keepScanning = e.target.checked;
    sheet.querySelector('#keep-status').hidden = !ui.keepScanning;
  });
  sheet.querySelector('#scan-qa-status').addEventListener('change', (e) => { ui.qaStatus = e.target.value; });

  const handleText = async (text) => {
    if (handled) return;
    handled = true;
    await stopScanner();
    const isbn = extractIsbn(text);
    if (!isbn) {
      status.innerHTML = `That code says "${esc(String(text).slice(0, 80))}", which isn't an ISBN. <button class="link-btn" data-act="rescan">Try again</button>`;
      return;
    }
    handleIsbn(isbn);
  };

  // keep-scanning mode: add with defaults, list it, go straight back to the camera
  const addAndContinue = async (isbn) => {
    const existing = findByIsbn(isbn);
    if (existing) {
      status.innerHTML = `"${esc(existing.title)}" is already in your library.`;
    } else {
      status.innerHTML = `Found ISBN <b class="num">${esc(isbn)}</b>. Adding…`;
      let r = null;
      if (isOnline()) { try { r = await lookupIsbn(isbn); } catch (e) { r = null; } }
      const details = r ? applyEdition(r) : applyEdition({ isbn, title: `ISBN ${isbn}` });
      const book = addBook({ ...details, isbn: details.isbn || isbn, status: ui.qaStatus });
      requestPersist();
      addedTitles.push(book.title);
      const list = sheet.querySelector('#scan-added');
      list.hidden = false;
      list.innerHTML = `<b>Added ${plural(addedTitles.length, 'book')}</b>${addedTitles.slice().reverse().map((t) => `<span>${icon('check')}${esc(t)}</span>`).join('')}`;
      status.innerHTML = r ? `Added "${esc(book.title)}". Next book…` : `Saved ISBN ${esc(isbn)}. Open it later to fill in the details.`;
    }
    setTimeout(() => { if (sheet.isConnected) begin(); }, 1300);
  };

  const handleIsbn = async (isbn) => {
    handled = true;
    if (keep()) { addAndContinue(isbn); return; }
    const existing = findByIsbn(isbn);
    if (existing) { closeAllSheets(); toast('Already in your library'); go(`#/book/${existing.id}`); return; }
    if (!isOnline()) {
      closeSheet();
      bookFormSheet({ isbn, title: '' }, { isNew: true, note: `Saved ISBN ${isbn}. You're offline, so add the title now and tap "Fill in missing details" later.` });
      return;
    }
    status.innerHTML = `Found ISBN <b class="num">${esc(isbn)}</b>. Looking it up…`;
    try {
      const r = await lookupIsbn(isbn);
      closeSheet();
      if (r) bookFormSheet(r, { isNew: true, fromDb: true });
      else bookFormSheet({ isbn }, { isNew: true, note: `No database had ISBN ${isbn}. Fill in what you know; you can retry the lookup later.` });
    } catch (e) {
      closeSheet();
      bookFormSheet({ isbn }, { isNew: true, note: `${e.message} The ISBN is saved; add the title and try "Fill in missing details" later.` });
    }
  };

  const begin = async () => {
    handled = false;
    if (!status.textContent || /Starting/.test(status.textContent)) status.textContent = 'Starting camera…';
    try {
      await startScanner('reader', handleText);
      if (!keep() || !addedTitles.length) status.textContent = 'Hold steady. It scans automatically.';
    } catch (e) {
      const msg = String(e && (e.message || e));
      status.innerHTML = /permission|notallowed|denied/i.test(msg)
        ? 'Camera access is off. Allow it in Settings › Safari › Camera (or for this app), type the ISBN, or scan a photo.'
        : 'The camera couldn\'t start here. Type the ISBN or scan a photo instead.';
      sheet.querySelector('#scan-hint').hidden = true;
    }
  };
  sheet.addEventListener('click', (e) => { if (e.target.closest('[data-act="rescan"]')) { e.stopPropagation(); begin(); } });
  sheet.querySelector('#isbn-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = cleanIsbn(sheet.querySelector('#isbn-input').value);
    if (v.length < 10) { status.textContent = 'An ISBN has 10 or 13 digits.'; return; }
    sheet.querySelector('#isbn-input').value = '';
    stopScanner();
    handleIsbn(v);
  });
  sheet.querySelector('#scan-photo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    await stopScanner();
    status.textContent = 'Reading the photo…';
    try {
      const text = await scanImageFile(file, 'reader');
      handled = false;
      handleText(text);
    } catch (err) {
      status.textContent = "Couldn't find a barcode in that photo. Try a closer, sharper shot.";
      if (keep()) setTimeout(() => { if (sheet.isConnected) begin(); }, 1500);
    }
  });
  setTimeout(begin, 350);
}

// ======================================================================
// Sheet: add / edit book
// ======================================================================
function bookFormSheet(initial, { isNew = false, fromDb = false, note = '', stay = false } = {}) {
  // a book you've added before comes back with the details you saved for it
  if (isNew && initial && initial.isbn) initial = applyEdition(initial);
  const b = { title: '', subtitle: '', authors: '', about: '', pages: '', genres: [], format: 'Paperback', ownership: 'Owned', status: 'toread', isbn: '', publisher: '', published: '', startedAt: '', finishedAt: '', progressMode: 'pages', cover: '', ...initial };
  let cover = b.cover || '';
  const existingColl = isNew ? [] : collectionsOf(b.id).map((c) => c.id);
  const opt = (list, cur) => list.map((o) => `<option ${o === cur ? 'selected' : ''}>${esc(o)}</option>`).join('');

  const sheet = openSheet(`${sheetHead(isNew ? 'New book' : 'Edit book')}
  <form id="book-form" class="form" autocomplete="off">
    ${note ? `<div class="callout">${esc(note)}</div>` : ''}
    ${fromDb ? '<p class="muted small" style="margin:0 4px">Details filled in from the book databases. Change anything that looks off.</p>' : ''}
    <div class="cover-edit">
      <div id="cover-preview">${coverHtml({ ...b, cover }, 'md')}</div>
      <div class="btns">
        <label class="btn small">${icon('photo')}Choose photo<input type="file" id="cover-file" accept="image/*" hidden></label>
        <button type="button" class="btn small ghost" id="cover-url-btn">Use image link</button>
        <button type="button" class="btn small ghost" id="cover-remove" ${cover ? '' : 'hidden'}>Remove cover</button>
      </div>
    </div>
    <input id="cover-url" class="input" type="url" placeholder="https://… image link" hidden>
    <button type="button" class="btn ghost block" id="fill-btn">${icon('refresh')}Fill in missing details</button>
    <label class="field"><span>Title</span><input class="input" id="bf-title" name="title" value="${esc(b.title)}" required></label>
    <label class="field"><span>Subtitle</span><input class="input" id="bf-subtitle" name="subtitle" value="${esc(b.subtitle)}"></label>
    <label class="field"><span>Author(s)</span><input class="input" id="bf-authors" name="authors" value="${esc(b.authors)}" placeholder="Separate with commas"></label>
    <label class="field"><span>About</span><textarea class="input about-input" id="bf-about" name="about" placeholder="What is it about?" data-autogrow>${esc(b.about)}</textarea></label>
    <div class="grid-2">
      <label class="field"><span>Pages</span><input class="input num" id="bf-pages" name="pages" type="number" inputmode="numeric" min="0" value="${esc(b.pages ?? '')}"></label>
      <label class="field"><span>Track progress by</span><select class="input" id="bf-mode" name="progressMode"><option value="pages" ${b.progressMode !== 'percent' ? 'selected' : ''}>Pages</option><option value="percent" ${b.progressMode === 'percent' ? 'selected' : ''}>Percent</option></select></label>
    </div>
    <div class="grid-2">
      <label class="field"><span>Format</span><select class="input" id="bf-format" name="format">${opt(FORMATS, b.format)}</select></label>
      <label class="field"><span>Ownership</span><select class="input" id="bf-own" name="ownership">${opt(OWNERSHIP, b.ownership)}</select></label>
    </div>
    <label class="field"><span>Reading status</span><select class="input" id="bf-status" name="status">${STATUSES.map((s) => `<option value="${s.id}" ${s.id === b.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select></label>
    <div class="field"><span>Genre</span>
      <div class="genre-field" id="bf-genre-field"></div>
      <input type="hidden" id="bf-genres" name="genres" value="${esc((b.genres || []).join(','))}"></div>
    <div class="grid-2">
      <label class="field"><span>Started</span><input class="input" id="bf-started" name="startedAt" type="date" value="${esc(b.startedAt)}"></label>
      <label class="field"><span>Finished</span><input class="input" id="bf-finished" name="finishedAt" type="date" value="${esc(b.finishedAt)}"></label>
    </div>
    <div class="grid-2">
      <label class="field"><span>ISBN</span><input class="input num" id="bf-isbn" name="isbn" inputmode="numeric" value="${esc(b.isbn)}"></label>
      <label class="field"><span>Published</span><input class="input" id="bf-published" name="published" value="${esc(b.published)}"></label>
    </div>
    <label class="field"><span>Publisher</span><input class="input" id="bf-publisher" name="publisher" value="${esc(b.publisher)}"></label>
    ${store.data.collections.length ? `<div class="field"><span>Collections</span><div class="chip-wrap">${store.data.collections.map((c) => `<label class="chip" style="cursor:pointer"><input type="checkbox" name="coll" value="${c.id}" ${existingColl.includes(c.id) ? 'checked' : ''} style="accent-color:var(--gold)">${esc(c.name)}</label>`).join('')}</div></div>` : ''}
    <button class="btn primary block" type="submit">${isNew ? 'Add to library' : 'Save changes'}</button>
    ${isNew ? '' : '<button type="button" class="btn danger block" id="delete-book">Delete book</button>'}
  </form>`);

  const form = sheet.querySelector('#book-form');
  const $ = (sel) => sheet.querySelector(sel);
  autogrow($('#bf-about'));
  const refreshCover = () => {
    $('#cover-preview').innerHTML = coverHtml({ title: $('#bf-title').value || 'Untitled', authors: $('#bf-authors').value, cover }, 'md');
    $('#cover-remove').hidden = !cover;
  };
  $('#cover-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { cover = await imageFileToDataUrl(f); refreshCover(); } catch (err) { toast(err.message); }
  });
  $('#cover-url-btn').addEventListener('click', () => { const u = $('#cover-url'); u.hidden = !u.hidden; if (!u.hidden) u.focus(); });
  $('#cover-url').addEventListener('change', (e) => { cover = e.target.value.trim(); refreshCover(); });
  $('#cover-remove').addEventListener('click', () => { cover = ''; $('#cover-url').value = ''; refreshCover(); });
  $('#bf-title').addEventListener('change', refreshCover);

  const genreVal = () => $('#bf-genres').value.split(',').map((x) => x.trim()).filter(Boolean);
  const showGenres = () => {
    const cur = genreVal();
    $('#bf-genre-field').innerHTML = `${cur.map((g) => `<span class="genre-chip">${esc(g)}</span>`).join('')}
      <button type="button" class="genre-chip add" id="bf-genre-pick">${icon(cur.length ? 'pen' : 'plus')}${cur.length ? 'Change' : 'Choose genres'}</button>`;
  };
  showGenres();
  $('#bf-genre-field').addEventListener('click', (e) => {
    if (!e.target.closest('#bf-genre-pick')) return;
    genrePickerSheet(genreVal(), (picked) => { $('#bf-genres').value = picked.join(','); showGenres(); });
  });

  $('#fill-btn').addEventListener('click', async () => {
    const probe = { title: $('#bf-title').value.trim(), authors: $('#bf-authors').value.trim(), isbn: cleanIsbn($('#bf-isbn').value) };
    if (!probe.title && !probe.isbn) { toast('Add a title or ISBN first'); return; }
    if (!isOnline()) { toast("You're offline. Try again when connected."); return; }
    const btn = $('#fill-btn');
    btn.disabled = true; btn.innerHTML = 'Looking it up…';
    try {
      const found = await lookupForBook(probe);
      if (!found) { toast('No match found. Check the title or ISBN.'); return; }
      const r = applyEdition(found);
      let filled = 0;
      const fill = (sel, val) => { const el = $(sel); if (el && !el.value.trim() && val) { el.value = val; filled += 1; } };
      fill('#bf-title', r.title); fill('#bf-subtitle', r.subtitle); fill('#bf-authors', r.authors); fill('#bf-about', r.about);
      fill('#bf-pages', r.pages ? String(r.pages) : ''); fill('#bf-genres', (r.genres || []).join(',')); fill('#bf-isbn', r.isbn);
      fill('#bf-published', r.published); fill('#bf-publisher', r.publisher);
      autogrow($('#bf-about'));
      if (!cover && r.cover) { cover = r.cover; filled += 1; refreshCover(); }
      showGenres();
      toast(filled ? `Filled in ${plural(filled, 'field')}` : 'Nothing was missing that the databases knew');
    } catch (e) {
      toast(e.message);
    } finally {
      btn.disabled = false; btn.innerHTML = `${icon('refresh')}Fill in missing details`;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = {
      title: fd.get('title').trim(), subtitle: fd.get('subtitle').trim(), authors: fd.get('authors').trim(),
      about: fd.get('about').trim(), pages: fd.get('pages'), progressMode: fd.get('progressMode'),
      format: fd.get('format'), ownership: fd.get('ownership'), status: fd.get('status'),
      genres: fd.get('genres').split(',').map((x) => x.trim()).filter(Boolean),
      startedAt: fd.get('startedAt'), finishedAt: fd.get('finishedAt'), isbn: fd.get('isbn').trim(),
      published: fd.get('published').trim(), publisher: fd.get('publisher').trim(), cover,
    };
    const colls = fd.getAll('coll');
    if (!data.title) { toast('A title is needed'); return; }
    rememberEdition(data);
    if (isNew) {
      const dup = findByIsbn(data.isbn);
      if (dup) {
        const ok = await confirmSheet({ title: 'Already in your library', message: `"${dup.title}" has the same ISBN. Add another copy anyway?`, confirm: 'Add anyway', danger: false });
        if (!ok) return;
      }
      const nb = addBook(data);
      setBookCollections(nb.id, colls);
      requestPersist();
      closeAllSheets();
      if (stay) {
        // added from Search: stay on the results so you can keep going
        toast(`Added "${nb.title}"`, { action: 'View', onAction: () => go(`#/book/${nb.id}`) });
      } else {
        toast(`Added "${nb.title}"`);
        go(`#/book/${nb.id}`);
      }
    } else {
      updateBook(b.id, data);
      setBookCollections(b.id, colls);
      closeSheet();
      toast('Saved');
    }
  });

  if (!isNew) {
    $('#delete-book').addEventListener('click', async () => {
      const ok = await confirmSheet({ title: `Delete "${b.title}"?`, message: 'Its notes and reading history go too. This can\'t be undone.' });
      if (!ok) return;
      deleteBook(b.id);
      closeAllSheets();
      toast('Book deleted');
      back('#/library');
    });
  }
}

// ======================================================================
// Sheet: genre picker (built-in list + your own genres)
// ======================================================================
function genrePickerSheet(selected, onDone) {
  let picked = selected.filter((g) => genreList().includes(g));
  const chip = (g) => `<button type="button" class="pick-chip ${picked.includes(g) ? 'on' : ''}" data-genre="${esc(g)}" aria-pressed="${picked.includes(g)}">${esc(g)}</button>`;
  const body = () => {
    const custom = genreList().filter((g) => !BUILT_IN_GENRES.includes(g));
    return `${GENRE_GROUPS.map((grp) => `<div class="pick-group"><div class="eyebrow">${esc(grp.name)}</div><div class="pick-chips">${grp.list.map(chip).join('')}</div></div>`).join('')}
      <div class="pick-group"><div class="eyebrow">Your genres</div>
        ${custom.length ? `<div class="pick-chips">${custom.map((g) => `<span class="pick-custom">${chip(g)}<button type="button" class="pick-del" data-del-genre="${esc(g)}" aria-label="Remove ${esc(g)} from the list">${icon('close')}</button></span>`).join('')}</div>` : '<p class="faint small" style="margin:0">Genres you add show up here.</p>'}
        <form class="pick-add" id="genre-add" autocomplete="off"><input class="input" id="genre-new" placeholder="Add a genre to the list" maxlength="30" enterkeyhint="done"><button class="btn" type="submit">Add</button></form>
      </div>`;
  };
  const sheet = openSheet(`${sheetHead('Genres')}
    <p class="muted small" style="margin:-8px 4px 12px">Pick as many as fit. <span id="pick-count"></span></p>
    <div id="pick-body">${body()}</div>
    <button class="btn primary block" id="pick-done" style="margin-top:16px">Done</button>`);
  const $ = (q) => sheet.querySelector(q);
  const count = () => { $('#pick-count').textContent = picked.length ? `${plural(picked.length, 'genre')} picked.` : ''; };
  const redraw = () => { $('#pick-body').innerHTML = body(); count(); };
  count();
  sheet.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-genre]');
    if (c) {
      const g = c.dataset.genre;
      picked = picked.includes(g) ? picked.filter((x) => x !== g) : [...picked, g];
      c.classList.toggle('on', picked.includes(g));
      c.setAttribute('aria-pressed', picked.includes(g));
      count();
      return;
    }
    const del = e.target.closest('[data-del-genre]');
    if (del) {
      const g = del.dataset.delGenre;
      const users = store.data.books.filter((b) => b.genres.includes(g));
      const ok = await confirmSheet({ title: `Remove "${g}"?`, message: users.length ? `It's also taken off ${plural(users.length, 'book')}.` : 'It comes off your genre list.', confirm: 'Remove' });
      if (!ok) return;
      store.data.customGenres = store.data.customGenres.filter((x) => x !== g);
      users.forEach((b) => { b.genres = b.genres.filter((x) => x !== g); });
      picked = picked.filter((x) => x !== g);
      store.save();
      redraw();
    }
  });
  sheet.addEventListener('submit', (e) => {
    if (e.target.id !== 'genre-add') return;
    e.preventDefault();
    const name = $('#genre-new').value.replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name) return;
    const existing = genreList().find((g) => g.toLowerCase() === name.toLowerCase());
    const g = existing || name.charAt(0).toUpperCase() + name.slice(1);
    if (!existing) { store.data.customGenres.push(g); store.save(); }
    if (!picked.includes(g)) picked.push(g);
    redraw();
    toast(existing ? `"${g}" is already on the list, so it's picked` : `Added "${g}" to your genres`);
  });
  $('#pick-done').addEventListener('click', () => { closeSheet(); onDone(picked); });
}

// ======================================================================
// Sheets: progress, sessions, notes, goals, collections
// ======================================================================
function progressSheet(bookId, { past = false } = {}) {
  const b = getBook(bookId);
  if (!b) return;
  let mode = b.progressMode === 'percent' ? 'percent' : 'page';
  const cur = pagePos(b);
  const curPct = progressPct(b);
  const sheet = openSheet(`${sheetHead(past ? 'Log past reading' : 'Update progress')}
    <form id="prog-form" class="form" autocomplete="off">
      <p class="muted small" style="margin:-6px 4px 0">${esc(b.title)} · now ${esc(progressText(b))}</p>
      <div class="seg" role="tablist">
        <button type="button" data-mode="page">On page</button>
        <button type="button" data-mode="read">Pages read</button>
        <button type="button" data-mode="percent">Percent</button>
      </div>
      <label class="field"><span id="pf-label"></span><input class="input num" id="pf-value" type="number" inputmode="decimal" min="0" step="any" required autofocus></label>
      <div class="grid-2">
        <label class="field"><span>Minutes spent</span><input class="input num" id="pf-min" type="number" inputmode="numeric" min="0" placeholder="Optional"></label>
        <label class="field"><span>Date</span><input class="input" id="pf-date" type="date" value="${todayKey()}" max="${todayKey()}"></label>
      </div>
      <label class="field"><span>Note</span><textarea class="input" id="pf-note" placeholder="Optional thought on this part" style="min-height:70px"></textarea></label>
      <button class="btn primary block" type="submit">Save</button>
    </form>`);
  const $ = (s) => sheet.querySelector(s);
  const setMode = (m) => {
    mode = m;
    sheet.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x.dataset.mode === m));
    const input = $('#pf-value');
    if (m === 'page') { $('#pf-label').textContent = b.pages ? `Page you're on (of ${b.pages})` : "Page you're on"; input.value = cur ?? ''; input.max = b.pages || ''; }
    if (m === 'read') { $('#pf-label').textContent = 'How many pages did you read?'; input.value = ''; input.removeAttribute('max'); }
    if (m === 'percent') { $('#pf-label').textContent = 'Percent complete'; input.value = curPct != null ? Math.round(curPct) : ''; input.max = 100; }
  };
  setMode(mode);
  sheet.querySelector('.seg').addEventListener('click', (e) => { const x = e.target.closest('[data-mode]'); if (x) setMode(x.dataset.mode); });
  $('#prog-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = Number($('#pf-value').value);
    if (!Number.isFinite(v) || v < 0) return;
    const pos = mode === 'page' ? { page: v } : mode === 'read' ? { pagesRead: v } : { percent: v };
    if (mode === 'percent' && b.progressMode !== 'percent') updateBook(b.id, { progressMode: 'percent' });
    if (mode === 'page' && b.progressMode === 'percent') updateBook(b.id, { progressMode: 'pages' });
    const min = Number($('#pf-min').value) || 0;
    const res = recordProgress(b.id, pos, { seconds: min * 60, date: $('#pf-date').value || todayKey(), note: $('#pf-note').value, type: 'manual' });
    closeSheet();
    savedToast('Progress saved');
    if (res && res.reachedEnd) offerFinish(b.id);
  });
}

async function offerFinish(bookId) {
  const b = getBook(bookId);
  const ok = await confirmSheet({ title: 'You reached the end!', message: `Mark "${b.title}" as finished?`, confirm: 'Mark finished', danger: false });
  if (ok) { updateBook(bookId, { status: 'finished' }); rateAfterFinish(bookId); }
}

function rateAfterFinish(bookId) {
  const b = getBook(bookId);
  const sheet = openSheet(`${sheetHead('How was it?')}
    <p class="muted" style="margin:-6px 0 16px">Rate "${esc(b.title)}". Tap or drag; quarter stars count.</p>
    <div class="rating-box" style="justify-content:center">${starsHtml(b.rating, { size: 'lg', rateId: b.id })}<span class="rating-val" data-rating-val>${fmtRating(b.rating)}</span></div>
    <button class="btn primary block" data-act="close-sheet" style="margin-top:20px">Done</button>`);
  return sheet;
}

function finishSessionSheet() {
  const a = store.data.active;
  const b = a && getBook(a.bookId);
  if (!b) return;
  const mins = sessionElapsed() / 60000;
  let mode = b.progressMode === 'percent' ? 'percent' : 'page';
  const cur = pagePos(b); const curPct = progressPct(b);
  const sheet = openSheet(`${sheetHead('Nice session')}
    <form id="fin-form" class="form" autocomplete="off">
      <p class="muted" style="margin:-6px 4px 0">You read <b style="color:var(--text)">${esc(mins < 1 ? 'under a minute' : fmtMinutes(mins))}</b> of ${esc(b.title)}.</p>
      <div class="seg"><button type="button" data-mode="page">Page</button><button type="button" data-mode="percent">Percent</button></div>
      <label class="field"><span id="ff-label"></span><input class="input num" id="ff-value" type="number" inputmode="decimal" min="0" step="any" autofocus></label>
      <label class="field"><span>Note</span><textarea class="input" id="ff-note" placeholder="Optional thought from this session" style="min-height:70px"></textarea></label>
      <button class="btn primary block" type="submit">Save session</button>
    </form>`);
  const $ = (s) => sheet.querySelector(s);
  const setMode = (m) => {
    mode = m;
    sheet.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x.dataset.mode === m));
    $('#ff-label').textContent = m === 'page' ? (b.pages ? `What page are you on now? (of ${b.pages})` : 'What page are you on now?') : 'Percent complete now';
    $('#ff-value').value = m === 'page' ? (cur ?? '') : (curPct != null ? Math.round(curPct) : '');
  };
  setMode(mode);
  sheet.querySelector('.seg').addEventListener('click', (e) => { const x = e.target.closest('[data-mode]'); if (x) setMode(x.dataset.mode); });
  $('#fin-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = $('#ff-value').value;
    const v = raw === '' ? null : Number(raw);
    const pos = v == null || !Number.isFinite(v) ? {} : (mode === 'page' ? { page: v } : { percent: v });
    if (mode === 'percent' && b.progressMode !== 'percent') updateBook(b.id, { progressMode: 'percent' });
    const res = finishSession(pos, $('#ff-note').value);
    if (ui.wakeLock) setWake(false);
    closeSheet();
    savedToast('Session saved');
    if (ui.route.name === 'timer') go(`#/book/${b.id}`); else render(true);
    if (res && res.reachedEnd) offerFinish(b.id);
  });
}

function noteSheet(bookId, noteId = null) {
  const b = getBook(bookId);
  const n = noteId ? b.notes.find((x) => x.id === noteId) : null;
  const sheet = openSheet(`${sheetHead(n ? 'Edit note' : 'New note')}
    <form id="note-form" class="form">
      <label class="field"><span>Page (leave empty for a note on the whole book)</span><input class="input num" id="nf-page" type="number" inputmode="numeric" min="0" value="${esc(n ? (n.page ?? '') : '')}" placeholder="${pagePos(b) ?? ''}"></label>
      <label class="field"><span>Note</span><textarea class="input" id="nf-text" required autofocus style="min-height:150px">${esc(n ? n.text : '')}</textarea></label>
      <button class="btn primary block" type="submit">Save note</button>
      ${n ? '<button type="button" class="btn danger block" id="nf-del">Delete note</button>' : ''}
    </form>`);
  sheet.querySelector('#note-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = sheet.querySelector('#nf-text').value;
    const page = sheet.querySelector('#nf-page').value;
    if (!text.trim()) return;
    if (n) updateNote(bookId, n.id, text, page); else addNote(bookId, text, page);
    closeSheet();
  });
  if (n) sheet.querySelector('#nf-del').addEventListener('click', async () => {
    if (await confirmSheet({ title: 'Delete this note?' })) { deleteNote(bookId, n.id); closeAllSheets(); }
  });
}

function goalsSheet() {
  const g = store.data.goals;
  const sheet = openSheet(`${sheetHead('Reading goals')}
    <form id="goal-form" class="form">
      <label class="field"><span>Daily reading time (minutes)</span><input class="input num" id="gf-daily" type="number" inputmode="numeric" min="1" value="${g.dailyMinutes}" required></label>
      <label class="field"><span>Books per year</span><input class="input num" id="gf-year" type="number" inputmode="numeric" min="1" value="${g.yearlyBooks}" required></label>
      <p class="muted small" style="margin:0 4px">Books count toward the year you finished them.</p>
      <button class="btn primary block" type="submit">Save goals</button>
    </form>`);
  sheet.querySelector('#goal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const n = (id, fb) => Math.max(1, Math.round(Number(sheet.querySelector(id).value)) || fb);
    store.data.goals = { dailyMinutes: n('#gf-daily', 30), yearlyBooks: n('#gf-year', 24) };
    store.save();
    closeSheet();
    toast('Goals saved');
  });
}

function collectionFormSheet(c = null) {
  let color = c ? c.color : COLL_COLORS[store.data.collections.length % COLL_COLORS.length];
  const sheet = openSheet(`${sheetHead(c ? 'Edit collection' : 'New collection')}
    <form id="coll-form" class="form" autocomplete="off">
      <label class="field"><span>Name</span><input class="input" id="cf-name" value="${esc(c ? c.name : '')}" placeholder="e.g. Book club picks" required autofocus></label>
      <label class="field"><span>Description</span><input class="input" id="cf-desc" value="${esc(c ? c.description : '')}" placeholder="Optional"></label>
      <div class="field"><span>Color</span><div class="swatches">${COLL_COLORS.map((col) => `<button type="button" class="swatch ${col === color ? 'on' : ''}" style="--c:${col}" data-color="${col}" aria-label="Color ${col}"></button>`).join('')}</div></div>
      <button class="btn primary block" type="submit">${c ? 'Save' : 'Create collection'}</button>
      ${c ? '<button type="button" class="btn danger block" id="cf-del">Delete collection</button>' : ''}
    </form>`);
  sheet.querySelector('.swatches').addEventListener('click', (e) => {
    const s = e.target.closest('[data-color]');
    if (!s) return;
    color = s.dataset.color;
    sheet.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === s));
  });
  sheet.querySelector('#coll-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = sheet.querySelector('#cf-name').value.trim();
    const description = sheet.querySelector('#cf-desc').value.trim();
    if (!name) return;
    if (c) { updateCollection(c.id, { name, description, color }); closeSheet(); }
    else { const nc = addCollection({ name, description, color }); closeSheet(); go(`#/collection/${nc.id}`); }
  });
  if (c) sheet.querySelector('#cf-del').addEventListener('click', async () => {
    if (await confirmSheet({ title: `Delete "${c.name}"?`, message: 'The books stay in your library; only the collection goes.' })) {
      deleteCollection(c.id); closeAllSheets(); back('#/collections');
    }
  });
}

function pickCollectionsSheet(bookId) {
  const current = collectionsOf(bookId).map((c) => c.id);
  const cs = store.data.collections;
  const sheet = openSheet(`${sheetHead('Collections')}
    <form id="pc-form" class="form">
      ${cs.length ? `<div class="check-list">${cs.map((c) => `<label class="check-item"><input type="checkbox" value="${c.id}" ${current.includes(c.id) ? 'checked' : ''}><span style="width:12px;height:12px;border-radius:50%;background:${esc(c.color)};flex:none"></span><span class="info"><b>${esc(c.name)}</b></span></label>`).join('')}</div>` : '<p class="muted">No collections yet. Make one below.</p>'}
      <div style="display:flex;gap:8px"><input class="input" id="pc-new" placeholder="New collection name" style="flex:1"><button type="button" class="btn" id="pc-add">Add</button></div>
      <button class="btn primary block" type="submit">Done</button>
    </form>`);
  sheet.querySelector('#pc-add').addEventListener('click', () => {
    const inp = sheet.querySelector('#pc-new');
    if (!inp.value.trim()) return;
    const nc = addCollection({ name: inp.value, color: COLL_COLORS[store.data.collections.length % COLL_COLORS.length] });
    const ids = [...sheet.querySelectorAll('.check-list input:checked')].map((x) => x.value);
    setBookCollections(bookId, [...ids, nc.id]);
    closeSheet();
    pickCollectionsSheet(bookId);
  });
  sheet.querySelector('#pc-form').addEventListener('submit', (e) => {
    e.preventDefault();
    setBookCollections(bookId, [...sheet.querySelectorAll('.check-list input:checked')].map((x) => x.value));
    closeSheet();
  });
}

function collAddBooksSheet(collId) {
  const c = getCollection(collId);
  const books = store.data.books.slice().sort((a, b) => a.title.localeCompare(b.title));
  if (!books.length) { toast('Add some books to your library first'); return; }
  const sheet = openSheet(`${sheetHead(`Books in ${c.name}`)}
    <label class="search">${icon('search')}<input id="cab-q" type="search" placeholder="Filter">${clearBtn('')}</label>
    <form id="cab-form" class="form">
      <div class="check-list">${books.map((b) => `<label class="check-item" data-t="${esc((b.title + ' ' + b.authors).toLowerCase())}"><input type="checkbox" value="${b.id}" ${c.bookIds.includes(b.id) ? 'checked' : ''}>${coverHtml(b, 'xs')}<span class="info"><b class="book-title">${esc(b.title)}</b><div class="muted small">${esc(b.authors)}</div></span></label>`).join('')}</div>
      <button class="btn primary block" type="submit">Save</button>
    </form>`);
  sheet.querySelector('#cab-q').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    sheet.querySelectorAll('.check-item').forEach((el) => { el.hidden = q && !el.dataset.t.includes(q); });
  });
  sheet.querySelector('#cab-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const ids = [...sheet.querySelectorAll('.check-list input:checked')].map((x) => x.value);
    updateCollection(c.id, { bookIds: ids });
    closeSheet();
  });
}

function quickPickSheet(bookId, field) {
  const b = getBook(bookId);
  const list = field === 'format' ? FORMATS : OWNERSHIP;
  const sheet = openSheet(`${sheetHead(field === 'format' ? 'Format' : 'Ownership')}
    <div class="option-list">${list.map((o) => `<button class="option" data-pick="${esc(o)}"><b style="flex:1">${esc(o)}</b>${b[field] === o ? icon('check') : ''}</button>`).join('')}</div>`);
  sheet.addEventListener('click', (e) => {
    const p = e.target.closest('[data-pick]');
    if (!p) return;
    const patch = { [field]: p.dataset.pick };
    if (field === 'format' && p.dataset.pick === 'Audiobook' && b.progressMode !== 'percent') patch.progressMode = 'percent';
    updateBook(bookId, patch);
    closeSheet();
  });
}

// ======================================================================
// Sheet: your name (asked once on first open, editable in Settings)
// ======================================================================
function nameSheet({ welcome = false } = {}) {
  const cur = store.data.settings.name || '';
  const markAsked = () => { if (!store.data.settings.askedName) { store.data.settings.askedName = true; store.save(); } };
  const sheet = openSheet(`${sheetHead(welcome ? 'Welcome to Lamplight' : 'Your name')}
    <form id="name-form" class="form" autocomplete="off">
      <p class="muted" style="margin:-6px 4px 0">${welcome ? 'What should we call you? Your name goes next to the greeting on the home screen.' : 'Shown next to the greeting on the home screen.'}</p>
      <label class="field"><span>Your name</span><input class="input" id="nm-name" value="${esc(cur)}" placeholder="e.g. Kim" maxlength="40" autocapitalize="words" enterkeyhint="done" autofocus></label>
      <button class="btn primary block" type="submit">${welcome ? 'Continue' : 'Save'}</button>
      ${welcome ? '<button type="button" class="btn ghost block" data-act="close-sheet">Skip for now</button>' : ''}
    </form>`, { onClose: markAsked });
  sheet.querySelector('#name-form').addEventListener('submit', (e) => {
    e.preventDefault();
    store.data.settings.name = sheet.querySelector('#nm-name').value.trim().replace(/\s+/g, ' ');
    store.data.settings.askedName = true;
    store.save();
    closeSheet();
    if (store.data.settings.name) toast(`Nice to meet you, ${store.data.settings.name}`);
  });
}

/** Grow a textarea to fit its text, so long descriptions don't need inner scrolling. */
function autogrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}

// ======================================================================
// iPhone widget (runs in the Scriptable app; see widget/lamplight-widget.js)
// ======================================================================
const WIDGET_SCRIPT_NAME = 'Lamplight Widget';
let widgetScript = null;
function loadWidgetScript() {
  if (!widgetScript) widgetScript = fetch('widget/lamplight-widget.js').then((r) => { if (!r.ok) throw new Error('missing'); return r.text(); });
  return widgetScript;
}

async function copyWidgetScript() {
  try {
    if (navigator.clipboard && window.ClipboardItem && navigator.clipboard.write) {
      // Safari wants the copy to start right away inside the tap; it accepts a promise for the text.
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': loadWidgetScript().then((t) => new Blob([t], { type: 'text/plain' })) })]);
    } else {
      await navigator.clipboard.writeText(await loadWidgetScript());
    }
    toast('Widget script copied. Paste it into a new Scriptable script.');
  } catch (e) {
    widgetScript = null;
    toast("Couldn't copy. Open the script link and copy it from there.", { action: 'Open', onAction: () => window.open('widget/lamplight-widget.js', '_blank') });
  }
}

function widgetData() {
  const d = store.data;
  const g = d.goals;
  const now = new Date();
  const st = streaks();
  const reading = d.books.filter((b) => b.status === 'reading')
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 3)
    .map((b) => ({
      title: b.title.slice(0, 80), author: (b.authors || '').slice(0, 60),
      pct: progressPct(b) != null ? Math.round(progressPct(b)) : 0, progress: progressText(b),
      cover: /^https:\/\//.test(b.cover || '') && b.cover.length < 400 ? b.cover : '',
    }));
  return {
    v: 1, updatedAt: now.toISOString(), name: d.settings.name || '',
    day: todayKey(), year: String(now.getFullYear()),
    todayMin: Math.round(minutesOn(todayKey())), dailyGoal: g.dailyMinutes, streak: st.current || 0,
    yearDone: finishedIn(now.getFullYear(), null).length, yearGoal: yearlyGoal(),
    reading,
  };
}

function updateWidget() {
  if (PREVIEW) { toast('The widget works from your installed copy'); return; }
  store.data.settings.widgetUpdated = new Date().toISOString();
  store.save();
  store.flush();
  const url = `scriptable:///run/${encodeURIComponent(WIDGET_SCRIPT_NAME)}?data=${encodeURIComponent(JSON.stringify(widgetData()))}`;
  location.href = url;
}

/** After saving reading, offer a one-tap widget refresh once the widget is set up. */
function savedToast(msg) {
  if (store.data.settings.widgetUpdated) toast(msg, { action: 'Update widget', onAction: updateWidget });
  else toast(msg);
}

// ======================================================================
// Backup
// ======================================================================
async function exportData() {
  if (PREVIEW) { toast('Backups work in your installed copy'); return; }
  const payload = { app: 'lamplight', version: 1, exportedAt: new Date().toISOString(), data: store.data };
  const json = JSON.stringify(payload, null, 2);
  const name = `lamplight-backup-${todayKey()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Lamplight backup' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    store.data.settings.lastBackup = new Date().toISOString();
    store.save();
    toast('Backup ready. Save it to Files or iCloud Drive.');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    toast("The backup couldn't be saved. Try again.");
  }
}

async function importData(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const data = parsed && parsed.data ? parsed.data : parsed;
    if (!data || !Array.isArray(data.books)) throw new Error('bad');
    const ok = await confirmSheet({ title: 'Restore this backup?', message: `It has ${plural(data.books.length, 'book')}. Everything currently in the app will be replaced.`, confirm: 'Restore', danger: true });
    if (!ok) return;
    store.replaceAll(data);
    primeCelebrations();
    await store.flush();
    toast('Backup restored');
    render();
  } catch (e) {
    toast("That file isn't a Lamplight backup.");
  }
}

// ======================================================================
// Event wiring
// ======================================================================
const actions = {
  'close-sheet': () => closeSheet(),
  back: (el) => back(el.dataset.fallback || '#/library'),
  'add-book': () => addBookSheet(),
  'open-scan': () => { closeSheet(); scanSheet(); },
  'open-search': () => { closeAllSheets(); go('#/search'); setTimeout(() => { const q = document.getElementById('search-q'); if (q) q.focus(); }, 80); },
  'pick-result': (el) => pickResult(Number(el.dataset.i), el),
  'quick-add': (el) => quickAddResult(Number(el.dataset.i)),
  'open-manual': () => { closeSheet(); bookFormSheet({}, { isNew: true }); },
  'manual-from-search': () => { const t = ui.search.q.trim(); closeAllSheets(); bookFormSheet(extractIsbn(t) ? { isbn: cleanIsbn(t) } : { title: t }, { isNew: true, stay: true }); },
  'edit-book': (el) => bookFormSheet(getBook(el.dataset.id), { isNew: false }),
  'fill-details': async (el) => {
    const b = getBook(el.dataset.id);
    if (!isOnline()) { toast("You're offline. Try again when connected."); return; }
    el.disabled = true; el.textContent = 'Looking it up…';
    try {
      const found = await lookupForBook(b);
      if (!found) { toast('No match found. You can write a description yourself.'); render(true); return; }
      const r = applyEdition(found);
      const patch = {};
      ['about', 'subtitle', 'publisher', 'published', 'isbn', 'cover', 'authors'].forEach((k) => { if (!b[k] && r[k]) patch[k] = r[k]; });
      if (!b.pages && r.pages) patch.pages = r.pages;
      if (!b.genres.length && r.genres && r.genres.length) patch.genres = r.genres;
      updateBook(b.id, patch);
      toast(Object.keys(patch).length ? `Filled in ${plural(Object.keys(patch).length, 'field')}` : 'Nothing new found');
    } catch (e) { toast(e.message); render(true); }
  },
  'set-status': (el) => {
    const b = getBook(el.dataset.id);
    const was = b.status;
    updateBook(el.dataset.id, { status: el.dataset.status });
    if (el.dataset.status === 'finished' && was !== 'finished' && !b.rating) rateAfterFinish(b.id);
  },
  'quick-pick': (el) => quickPickSheet(el.dataset.id, el.dataset.field),
  'clear-search': (el, e) => {
    e.preventDefault();
    const input = el.closest('.search').querySelector('input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (input.id === 'search-q') { ui.search.state = 'idle'; ui.search.results = []; refreshResults(); }
    input.focus();
  },
  'pick-genres': (el) => { const b = getBook(el.dataset.id); if (b) genrePickerSheet(b.genres, (genres) => updateBook(b.id, { genres })); },
  'toggle-about': (el) => { ui.aboutOpen[el.dataset.id] = !ui.aboutOpen[el.dataset.id]; render(true); },
  'rate-step': (el) => { const b = getBook(el.dataset.id); updateBook(b.id, { rating: Math.min(5, Math.max(0, (b.rating || 0) + Number(el.dataset.d))) }); },
  'rate-clear': (el) => updateBook(el.dataset.id, { rating: 0 }),
  'start-reread': async (el) => {
    const b = getBook(el.dataset.id);
    if (!b) return;
    const ok = await confirmSheet({ title: `Read "${b.title}" again?`, message: `It goes back to Reading from the start. Your ${b.status === 'dnf' ? 'earlier attempt' : 'first read'}, its dates and your reading history stay in this book's stats.`, confirm: 'Start re-read', danger: false });
    if (!ok) return;
    const before = startReread(b.id);
    toast('Re-read started', { action: 'Undo', onAction: () => restoreBook(before) });
  },
  'start-session': (el) => {
    const a = store.data.active;
    if (a && a.bookId !== el.dataset.id) {
      const other = getBook(a.bookId);
      toast(`Finish your session with "${other ? other.title : 'another book'}" first`, { action: 'Open', onAction: () => go('#/timer') });
      return;
    }
    if (!a) startSession(el.dataset.id);
    go('#/timer');
  },
  'update-progress': (el) => progressSheet(el.dataset.id, { past: !!el.dataset.past }),
  'timer-pause': () => pauseSession(),
  'timer-resume': () => resumeSession(),
  'timer-finish': () => finishSessionSheet(),
  'timer-cancel': async () => {
    if (await confirmSheet({ title: 'Discard this session?', message: "The time won't be saved.", confirm: 'Discard' })) {
      const id = store.data.active && store.data.active.bookId;
      cancelSession(); if (ui.wakeLock) setWake(false); go(id ? `#/book/${id}` : '#/home');
    }
  },
  'add-note': (el) => noteSheet(el.dataset.id),
  'edit-note': (el) => noteSheet(el.dataset.id, el.dataset.note),
  'delete-log': async (el) => { if (await confirmSheet({ title: 'Delete this entry?', message: 'It comes out of your stats. Your current page stays as it is.' })) deleteLog(el.dataset.log); },
  'pick-collections': (el) => pickCollectionsSheet(el.dataset.id),
  'new-collection': () => collectionFormSheet(),
  'edit-collection': (el) => collectionFormSheet(getCollection(el.dataset.id)),
  'coll-add-books': (el) => collAddBooksSheet(el.dataset.id),
  'coll-remove': (el, e) => {
    e.preventDefault(); e.stopPropagation();
    const c = getCollection(el.dataset.coll);
    updateCollection(c.id, { bookIds: c.bookIds.filter((x) => x !== el.dataset.id) });
    toast('Removed from collection');
  },
  'edit-goals': () => goalsSheet(),
  'edit-name': () => nameSheet(),
  'drag-noop': (el, e) => { e.preventDefault(); e.stopPropagation(); },
  'copy-widget': () => copyWidgetScript(),
  'update-widget': () => updateWidget(),
  'lib-status': (el) => { ui.lib.status = el.dataset.status; render(true); },
  'lib-filter': (el, e) => { e.preventDefault(); ui.lib = { ...ui.lib, status: el.dataset.status, q: '' }; go('#/library'); },
  'clear-filters': () => { ui.lib = { q: '', status: 'all', own: 'all', format: 'all', genre: 'all', sort: ui.lib.sort }; render(true); },
  'cal-move': (el) => {
    const d = new Date(ui.cal.y, ui.cal.m + Number(el.dataset.d), 1);
    ui.cal.y = d.getFullYear(); ui.cal.m = d.getMonth();
    render(true);
  },
  'cal-day': (el) => { ui.cal.sel = el.dataset.key; render(true); },
  export: () => exportData(),
  'load-samples': () => { loadSamples(); toast('Example books added'); },
  'remove-samples': async () => { if (await confirmSheet({ title: 'Remove example books?', message: 'Your own books stay put.', confirm: 'Remove' })) { removeSamples(); toast('Examples removed'); } },
  'erase-all': async () => {
    if (await confirmSheet({ title: 'Erase everything?', message: 'Every book, note, session and collection on this phone will be deleted. Save a backup first if you might want it back.', confirm: 'Erase everything' })) {
      store.replaceAll(null); primeCelebrations(); await store.flush(); toast('All data erased'); go('#/home');
    }
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) {
    if (el.tagName === 'A' && el.dataset.act !== 'lib-filter') e.preventDefault();
    actions[el.dataset.act](el, e);
    return;
  }
  const nav = e.target.closest('a[data-nav], #tabbar a');
  if (nav && nav.getAttribute('href') && nav.getAttribute('href').startsWith('#')) {
    e.preventDefault();
    const href = nav.getAttribute('href');
    if (nav.closest('#tabbar')) { ui.navDepth = 0; if (location.hash !== href) location.hash = href; else window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else go(href);
  }
});

document.addEventListener('input', (e) => {
  const bar = e.target.closest && e.target.closest('.search');
  if (bar) { const x = bar.querySelector('.search-clear'); if (x) x.hidden = !e.target.value; }
  if (e.target.matches && e.target.matches('textarea[data-autogrow]')) autogrow(e.target);
  if (e.target.dataset.input === 'search-q') ui.search.q = e.target.value;
  if (e.target.dataset.input === 'lib-search') {
    ui.lib.q = e.target.value;
    const list = document.getElementById('lib-list');
    if (list) list.innerHTML = libraryListHtml();
  }
});

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'search-form') return;
  e.preventDefault();
  const input = document.getElementById('search-q');
  ui.search.q = input.value;
  input.blur();
  runSearch();
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'qa-status') ui.qaStatus = e.target.value;
  if (e.target.id === 'coll-sort') { store.data.settings.collectionsSort = e.target.value; store.save(); }
  if (e.target.id === 'cbook-sort') { const c = getCollection(ui.route.id); if (c) { c.sort = e.target.value; store.save(); } }
  const k = e.target.dataset.change;
  if (!k) return;
  if (k === 'lib-own') { ui.lib.own = e.target.value; render(true); }
  if (k === 'lib-format') { ui.lib.format = e.target.value; render(true); }
  if (k === 'lib-genre') { ui.lib.genre = e.target.value; render(true); }
  if (k === 'lib-sort') { ui.lib.sort = e.target.value; store.data.settings.librarySort = ui.lib.sort; store.save(); }
  if (k === 'import' && e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; }
  if (k === 'wake') setWake(e.target.checked);
  if (k === 'english-only') { store.data.settings.englishOnly = e.target.checked; store.save(); ui.search.state = 'idle'; ui.search.results = []; }
});

// ---------- drag and drop to arrange (My order) ----------
// Works for the library list, the collections grid and the books in a collection.
// Drag an item by its ⠿ handle: it follows your finger, and when your finger
// passes the middle of another item they swap places. The page scrolls when you
// drag near the top or bottom edge. Letting go saves the new order.
const dropHandlers = {
  library(ids) {
    // put the visible books, in their new order, back into the slots they held in the full order
    const all = store.data.books.slice().sort(byMyOrder).map((b) => b.id);
    const shown = new Set(ids);
    let i = 0;
    store.data.libraryOrder = all.map((id) => (shown.has(id) ? ids[i++] : id));
  },
  collections(ids) {
    const byId = new Map(store.data.collections.map((c) => [c.id, c]));
    store.data.collections = [...ids.map((id) => byId.get(id)).filter(Boolean), ...store.data.collections.filter((c) => !ids.includes(c.id))];
  },
  collection(ids, list) {
    const c = getCollection(list.dataset.coll);
    if (c) c.bookIds = [...ids, ...c.bookIds.filter((id) => !ids.includes(id))];
  },
};

function dragUpdate() {
  const d = dragging;
  if (!d) return;
  const { el, list, x, y } = d;
  // swap with the item under the finger once the finger is past its middle
  const items = [...list.children].filter((c) => c.dataset && c.dataset.id);
  const target = items.find((c) => {
    if (c === el) return false;
    const r = c.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
  if (target) {
    const from = items.indexOf(el); const to = items.indexOf(target);
    const r = target.getBoundingClientRect();
    const sameRow = Math.abs(r.top - (el.getBoundingClientRect().top - d.ty)) < r.height / 2;
    const past = sameRow
      ? (to > from ? x > r.left + r.width / 2 : x < r.left + r.width / 2)
      : (to > from ? y > r.top + r.height / 2 : y < r.top + r.height / 2);
    if (past) list.insertBefore(el, to > from ? target.nextSibling : target);
  }
  // keep the item under the finger wherever its slot is now
  const r = el.getBoundingClientRect();
  const naturalLeft = r.left - d.tx; const naturalTop = r.top - d.ty;
  d.tx = x - d.grabX - naturalLeft; d.ty = y - d.grabY - naturalTop;
  el.style.transform = `translate(${d.tx}px, ${d.ty}px)`;
}
function dragAutoScroll() {
  const d = dragging;
  if (!d) return;
  const bottomEdge = window.innerHeight - 110;
  let step = 0;
  if (d.y < 90) step = -Math.ceil((90 - d.y) / 8);
  else if (d.y > bottomEdge) step = Math.ceil((d.y - bottomEdge) / 8);
  if (step) { window.scrollBy(0, step); dragUpdate(); }
  d.raf = requestAnimationFrame(dragAutoScroll);
}
function dragEnd() {
  const d = dragging;
  if (!d) return;
  dragging = null;
  cancelAnimationFrame(d.raf);
  d.el.style.transform = '';
  d.el.classList.remove('dragging');
  d.list.classList.remove('is-dragging');
  const ids = [...d.list.children].map((c) => c.dataset && c.dataset.id).filter(Boolean);
  const save = dropHandlers[d.list.dataset.sortKind];
  if (save) { save(ids, d.list); store.save(); }
  if (renderAfterDrag) { renderAfterDrag = false; scheduleRender(); }
}
document.addEventListener('pointerdown', (e) => {
  const h = e.target.closest('.drag-handle');
  if (!h) return;
  const list = h.closest('[data-sort-kind]');
  const el = list && [...list.children].find((c) => c.contains(h));
  if (!el) return;
  e.preventDefault();
  const r = el.getBoundingClientRect();
  dragging = { el, list, x: e.clientX, y: e.clientY, grabX: e.clientX - r.left, grabY: e.clientY - r.top, tx: 0, ty: 0, raf: 0 };
  el.classList.add('dragging');
  list.classList.add('is-dragging');
  try { h.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (navigator.vibrate) { try { navigator.vibrate(10); } catch (err) { /* ignore */ } }
  dragging.raf = requestAnimationFrame(dragAutoScroll);
});
document.addEventListener('pointermove', (e) => { if (dragging) { dragging.x = e.clientX; dragging.y = e.clientY; dragUpdate(); } });
document.addEventListener('pointerup', dragEnd);
document.addEventListener('pointercancel', dragEnd);

// ---------- star rating: tap, drag, keyboard ----------
let dragStars = null;
function previewRating(el, v) {
  paintStars(el, v);
  const box = el.closest('.rating-box');
  const out = box && box.querySelector('[data-rating-val]');
  if (out) out.textContent = fmtRating(v);
}
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-rate]');
  if (!el) return;
  e.preventDefault();
  dragStars = el;
  try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  previewRating(el, starValueAt(el, e.clientX));
});
document.addEventListener('pointermove', (e) => { if (dragStars) previewRating(dragStars, starValueAt(dragStars, e.clientX)); });
const endDrag = () => {
  if (!dragStars) return;
  const el = dragStars; dragStars = null;
  updateBook(el.dataset.rate, { rating: Number(el.dataset.value) });
};
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);
document.addEventListener('keydown', (e) => {
  const el = e.target.closest && e.target.closest('[data-rate]');
  if (!el) return;
  const d = { ArrowRight: 0.25, ArrowUp: 0.25, ArrowLeft: -0.25, ArrowDown: -0.25 }[e.key];
  if (d == null) return;
  e.preventDefault();
  const v = Math.min(5, Math.max(0, Number(el.dataset.value) + d));
  previewRating(el, v);
  updateBook(el.dataset.rate, { rating: v });
});

// keep data safe when iOS suspends the app
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.flush();
  else { tick(); if (ui.wantWake && store.data.active) setWake(true); }
});
window.addEventListener('pagehide', () => store.flush());


// ======================================================================
// Offline support (service worker) and start-up
// ======================================================================
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    // iPhone home-screen apps often resume instead of relaunching, so check for
    // a new version every time the app comes back to the front
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    if (reg.waiting) reg.waiting.postMessage('skipWaiting');
  }).catch(() => { /* offline support unavailable here */ });
  // A new version took over: reload into it, but never in the middle of a form.
  let reloaded = false;
  const reloadWhenIdle = () => {
    if (reloaded) return;
    if (document.querySelector('.sheet-wrap') && document.visibilityState === 'visible') { setTimeout(reloadWhenIdle, 1500); return; }
    reloaded = true;
    store.flush().finally(() => location.reload());
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) reloadWhenIdle(); });
}


/** Tapping the widget opens Safari (iOS won't open Home Screen web apps from a
 *  widget). Safari keeps a separate, empty library, so say where the real one is. */
function widgetInSafariNote() {
  const standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if (standalone || !/[?&]from=widget\b/.test(location.search)) return false;
  document.getElementById('app').innerHTML = `<div class="safari-note">
    <div class="sn-icon"><img src="icons/apple-touch-icon.png" alt=""></div>
    <h1>Open Lamplight from your Home Screen</h1>
    <p>Your library lives in the Lamplight app on your Home Screen. This is Safari, which keeps its own separate, empty copy.</p>
    <p class="muted small">iPhone widgets can only open Safari for web apps, not the Home Screen app. Close this tab and tap the Lamplight icon instead.</p>
  </div>`;
  return true;
}

async function start() {
  if (widgetInSafariNote()) return;
  await store.load();
  ui.lib.sort = store.data.settings.librarySort || 'added';
  store.listeners.add(scheduleRender);
  store.listeners.add(checkGoals);
  ui.route = parseRoute();
  render();
  checkGoals();
  if (!store.data.settings.askedName && !PREVIEW) setTimeout(() => nameSheet({ welcome: true }), 500);
  registerSW();
  // settings screen shows whether storage is protected
  new MutationObserver(() => showPersistState()).observe(view, { childList: true });
  showPersistState();
}
start();

// exposed for testing in the browser console
window.lamplight = { store, render, version: APP_VERSION, widgetData, celebrate: () => showCelebration([{ title: 'Daily reading goal', text: 'This is a test of the celebration screen.', color: 'var(--gold)' }], store.data.settings.name) };
