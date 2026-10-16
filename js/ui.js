// ui.js: small building blocks shared by every screen
// (escaping text, covers, stars, rings, bottom sheets, toasts, formatting).

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- icons (round caps and joins everywhere) ----------
const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m10 6 6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 9v6M10 9v6M13 9v6M17 9v6"/>',
  pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  book: '<path d="M4.5 5.5A2 2 0 0 1 6.5 4H19v14H6.5a2 2 0 0 0-2 2z"/><path d="M4.5 20V5.5M8.5 8h7"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  note: '<path d="M6 4h9l4 4v12H6z"/><path d="M9 12h6M9 16h4"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  photo: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m20 16-4.5-4.5L7 19"/>',
  type: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 19h14"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M5 19h14"/>',
  refresh: '<path d="M19 11a7 7 0 0 0-12.5-4.3L5 8M5 4v4h4M5 13a7 7 0 0 0 12.5 4.3L19 16M19 20v-4h-4"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  flame: '<path d="M12 2.5c.6 3.2 4.8 5.6 4.8 10.4A4.8 4.8 0 0 1 12 17.7a4.8 4.8 0 0 1-4.8-4.8c0-1.9.9-3.3 1.9-4.4.2 1.5 1 2.6 2 2.9-.6-3.1.2-6.3.9-8.9zM12 21.5a6.6 6.6 0 0 1-6.6-6.6c0-.6.1-1.2.2-1.8a6.6 6.6 0 0 0 12.8 0c.1.6.2 1.2.2 1.8a6.6 6.6 0 0 1-6.6 6.6z"/>',
  more: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
  grip: '<circle cx="9" cy="6.5" r="1.4"/><circle cx="15" cy="6.5" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="17.5" r="1.4"/><circle cx="15" cy="17.5" r="1.4"/>',
};
export const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;

// ---------- covers ----------
function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); }
export function coverHtml(book, size = 'md') {
  const h = hash((book.title || '') + (book.authors || ''));
  const hue1 = 200 + (h % 120);
  const hue2 = (hue1 + 40) % 360;
  const bg = `linear-gradient(155deg, hsl(${hue1} 45% 38%), hsl(${hue2} 50% 22%))`;
  const img = book.cover ? `<img src="${esc(book.cover)}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<div class="cover ${size}" style="background:${bg}">
    <div class="ph"><b>${esc(book.title)}</b><i>${esc((book.authors || '').split(',')[0])}</i></div>${img}</div>`;
}

// ---------- stars ----------
const STAR = '<path d="M12 2.6c.4 0 .8.2 1 .6l2.4 4.9 5.4.8c.9.1 1.3 1.2.6 1.9l-3.9 3.8.9 5.4c.2.9-.8 1.6-1.6 1.2L12 18.6l-4.8 2.5c-.8.4-1.8-.3-1.6-1.2l.9-5.4-3.9-3.8c-.7-.7-.3-1.8.6-1.9l5.4-.8L11 3.2c.2-.4.6-.6 1-.6z"/>';
export function starsHtml(value = 0, { size = 'sm', rateId = null } = {}) {
  let s = '';
  for (let i = 0; i < 5; i++) {
    const fill = Math.max(0, Math.min(1, value - i)) * 100;
    s += `<span class="star"><svg class="base" viewBox="0 0 24 24">${STAR}</svg><span class="fill" style="width:${fill}%"><svg viewBox="0 0 24 24">${STAR}</svg></span></span>`;
  }
  const attrs = rateId
    ? `data-rate="${esc(rateId)}" role="slider" tabindex="0" aria-label="Rating" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${value}" aria-valuetext="${fmtRating(value)} stars"`
    : `aria-label="${fmtRating(value)} out of 5 stars" role="img"`;
  return `<span class="stars ${size}" ${attrs} data-value="${value}">${s}</span>`;
}
export function paintStars(el, value) {
  el.dataset.value = value;
  el.setAttribute('aria-valuenow', value);
  el.querySelectorAll('.star .fill').forEach((f, i) => { f.style.width = `${Math.max(0, Math.min(1, value - i)) * 100}%`; });
}
export const fmtRating = (v) => (v ? (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, '')) : '–');

/** Value 0–5 in quarter steps from a pointer position over a .stars element. */
export function starValueAt(el, clientX) {
  const stars = [...el.querySelectorAll('.star')];
  const first = stars[0].getBoundingClientRect();
  if (clientX < first.left - 4) return 0;
  for (let i = 0; i < stars.length; i++) {
    const r = stars[i].getBoundingClientRect();
    const next = stars[i + 1] ? stars[i + 1].getBoundingClientRect().left : r.right + 8;
    if (clientX < next) {
      const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      return Math.max(0.25, i + Math.ceil(frac * 4) / 4);
    }
  }
  return 5;
}

// ---------- progress ring ----------
export function ringHtml(value, max, { label, small, cls = '' } = {}) {
  const r = 33; const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return `<div class="ring ${cls}"><svg viewBox="0 0 78 78"><circle class="track" cx="39" cy="39" r="${r}"/>
    <circle class="val" cx="39" cy="39" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/></svg>
    <div class="lbl"><div>${label}${small ? `<small>${small}</small>` : ''}</div></div></div>`;
}

// ---------- sheets ----------
const sheets = [];
export function openSheet(inner, { onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop" data-act="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${inner}</div>`;
  document.body.appendChild(wrap);
  sheets.push({ wrap, onClose });
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  document.body.style.overflow = 'hidden';
  const sheet = wrap.querySelector('.sheet');
  const first = sheet.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 320);
  return sheet;
}
export function closeSheet() {
  const s = sheets.pop();
  if (!s) return;
  s.wrap.classList.remove('open');
  setTimeout(() => s.wrap.remove(), 280);
  if (!sheets.length) document.body.style.overflow = '';
  if (s.onClose) s.onClose();
}
export function closeAllSheets() { while (sheets.length) closeSheet(); }
export const topSheet = () => (sheets.length ? sheets[sheets.length - 1].wrap.querySelector('.sheet') : null);
export const sheetHead = (title) => `<div class="sheet-head"><h3>${esc(title)}</h3><button class="icon-btn" data-act="close-sheet" aria-label="Close">${icon('close')}</button></div>`;

/** A themed yes/no sheet. Resolves true/false. */
export function confirmSheet({ title, message = '', confirm = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    let answered = false;
    const sheet = openSheet(`${sheetHead(title)}
      ${message ? `<p class="muted" style="margin:0 0 18px">${esc(message)}</p>` : ''}
      <div class="btn-row"><button class="btn ghost" data-confirm="no">Cancel</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-confirm="yes">${esc(confirm)}</button></div>`,
    { onClose: () => { if (!answered) resolve(false); } });
    sheet.addEventListener('click', (e) => {
      const b = e.target.closest('[data-confirm]');
      if (!b) return;
      answered = true;
      resolve(b.dataset.confirm === 'yes');
      closeSheet();
    });
  });
}

// ---------- toast ----------
export function toast(msg, { action, onAction, ms = 3200 } = {}) {
  const host = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { if (onAction) onAction(); t.remove(); };
  host.appendChild(t);
  setTimeout(() => t.remove(), action ? ms * 2 : ms);
}

// ---------- formatting ----------
export function fmtClock(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}
export function fmtMinutes(min) {
  min = Math.round(min);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60); const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
export function fmtDate(key, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!key) return '';
  const [y, m, d] = String(key).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(key);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}
export const plural = (n, word, pl = `${word}s`) => `${n} ${n === 1 ? word : pl}`;

/** Resize a picked photo into a small JPEG data URL so covers work offline. */
export function imageFileToDataUrl(file, maxSide = 600) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be read.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
