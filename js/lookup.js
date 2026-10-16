// lookup.js: fills in book details from free, keyless databases:
// Google Books (best for descriptions and genres), Open Library (good for
// page counts and covers) and, when something is still missing, Apple Books
// (descriptions, genres and sharp covers). Anything still missing can be
// typed in by hand. Goodreads and Amazon don't offer a way for apps to read
// their data, so the book page links to them instead.
//
// Consistency rules (1.3):
// - An ISBN identifies one exact edition, so details are always taken from an
//   ISBN lookup when there is an ISBN, never from a loose title search.
// - Google's ISBN search sometimes returns a different book; its answer is only
//   used when the returned book really carries that ISBN.
// - Edition facts (pages, publisher, date) come from Open Library's edition
//   record first, Google second. Descriptions and genres prefer Google.
// - Each ISBN's answer is remembered for this session, and app.js overlays any
//   details you saved for that ISBN before (store.editions).

const TIMEOUT = 12000;

async function getJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export const isOnline = () => navigator.onLine !== false;

export function cleanIsbn(s) { return String(s || '').replace(/[^0-9Xx]/g, '').toUpperCase(); }

function validIsbn13(s) {
  if (!/^\d{13}$/.test(s)) return false;
  const sum = s.split('').reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
  return sum % 10 === 0;
}
function validIsbn10(s) {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  const sum = s.split('').reduce((acc, c, i) => acc + (c === 'X' ? 10 : Number(c)) * (10 - i), 0);
  return sum % 11 === 0;
}

/** Pull an ISBN out of whatever a barcode or QR code contained. */
export function extractIsbn(text) {
  if (!text) return null;
  const t = String(text).replace(/[\s-]/g, '');
  const m13 = t.match(/97[89]\d{10}/g) || [];
  const good13 = m13.find(validIsbn13) || m13[0];
  if (good13) return good13;
  const m10 = t.match(/\d{9}[\dXx]/g) || [];
  const good10 = m10.map((x) => x.toUpperCase()).find(validIsbn10);
  if (good10) return good10;
  if (/^\d{12,13}$/.test(t)) return t; // UPC/EAN on some editions
  return null;
}

function stripHtml(html) {
  if (!html) return '';
  const withBreaks = String(html).replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
  try {
    const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
    return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  } catch (e) {
    return withBreaks.replace(/<[^>]+>/g, '').trim();
  }
}

function genresFromCategories(cats = []) {
  const out = [];
  cats.forEach((c) => String(c).split('/').forEach((p) => {
    const g = p.trim();
    if (g && !/^general$/i.test(g) && !out.some((x) => x.toLowerCase() === g.toLowerCase())) out.push(g);
  }));
  return out.slice(0, 5);
}

function genresFromSubjects(subjects = []) {
  const names = subjects.map((s) => (typeof s === 'string' ? s : s && s.name) || '').filter(Boolean);
  const skip = /(accessible book|protected daisy|in library|large type|nyt|new york times|reading level|award|staff picks|open library|lending library|overdrive|\d{4})/i;
  const out = [];
  names.forEach((n) => {
    const g = n.replace(/\s*\(.*?\)\s*/g, '').trim();
    if (g.length > 2 && g.length < 26 && !skip.test(g) && !g.includes(',') && !out.some((x) => x.toLowerCase() === g.toLowerCase())) {
      out.push(g.charAt(0).toUpperCase() + g.slice(1));
    }
  });
  return out.slice(0, 4);
}

function httpsCover(url) {
  if (!url) return '';
  return url.replace(/^http:/, 'https:').replace('&edge=curl', '').replace(/zoom=\d/, 'zoom=1');
}

function fromGoogle(vi = {}) {
  const ids = vi.industryIdentifiers || [];
  const isbn = (ids.find((i) => i.type === 'ISBN_13') || ids.find((i) => i.type === 'ISBN_10') || {}).identifier || '';
  return {
    title: vi.title || '',
    subtitle: vi.subtitle || '',
    authors: (vi.authors || []).join(', '),
    about: stripHtml(vi.description),
    pages: vi.pageCount || null,
    genres: genresFromCategories(vi.categories),
    publisher: vi.publisher || '',
    published: (vi.publishedDate || '').slice(0, 10),
    isbn,
    cover: httpsCover((vi.imageLinks && (vi.imageLinks.thumbnail || vi.imageLinks.smallThumbnail)) || ''),
  };
}

/** ISBN-10 and ISBN-13 forms of the same number, for matching. */
function isbnForms(isbn) {
  const s = cleanIsbn(isbn);
  const forms = new Set([s]);
  if (s.length === 10) {
    const core = `978${s.slice(0, 9)}`;
    const sum = core.split('').reduce((a, d, i) => a + Number(d) * (i % 2 ? 3 : 1), 0);
    forms.add(core + ((10 - (sum % 10)) % 10));
  } else if (s.length === 13 && s.startsWith('978')) {
    const core = s.slice(3, 12);
    const sum = core.split('').reduce((a, d, i) => a + Number(d) * (10 - i), 0);
    const c = (11 - (sum % 11)) % 11;
    forms.add(core + (c === 10 ? 'X' : String(c)));
  }
  return forms;
}

async function googleByIsbn(isbn) {
  const data = await getJSON(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=5`);
  const want = isbnForms(isbn);
  const item = (data.items || []).find((it) => ((it.volumeInfo && it.volumeInfo.industryIdentifiers) || [])
    .some((id) => want.has(cleanIsbn(id.identifier))));
  return item ? fromGoogle(item.volumeInfo) : null;
}

async function openLibraryByIsbn(isbn) {
  const data = await getJSON(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
  const r = data[`ISBN:${isbn}`];
  if (!r) return null;
  return {
    title: r.title || '',
    subtitle: r.subtitle || '',
    authors: (r.authors || []).map((a) => a.name).join(', '),
    pages: r.number_of_pages || (r.pagination && Number.parseInt(r.pagination, 10)) || null,
    publisher: ((r.publishers || [])[0] || {}).name || '',
    published: r.publish_date || '',
    genres: genresFromSubjects(r.subjects),
    cover: (r.cover && (r.cover.large || r.cover.medium)) ? (r.cover.large || r.cover.medium).replace(/^http:/, 'https:') : '',
    isbn,
    _olKey: r.key || '',
  };
}

async function openLibraryDescription(editionKey) {
  try {
    const ed = await getJSON(`https://openlibrary.org${editionKey}.json`);
    let desc = ed.description;
    if (!desc && ed.works && ed.works[0]) {
      const work = await getJSON(`https://openlibrary.org${ed.works[0].key}.json`);
      desc = work.description;
    }
    return typeof desc === 'string' ? desc : (desc && desc.value) || '';
  } catch (e) { return ''; }
}

async function openLibraryWorkDescription(workKey) {
  try {
    const work = await getJSON(`https://openlibrary.org${workKey}.json`);
    const d = work.description;
    return typeof d === 'string' ? d : (d && d.value) || '';
  } catch (e) { return ''; }
}

/** "Melissa Hill, Melissa Hill, Hill Melissa" -> "Melissa Hill" */
function cleanAuthors(s) {
  const words = (n) => n.toLowerCase().replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter(Boolean);
  let parts = String(s || '').split(/\s*[,;]\s*/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  // a lone "Hill, Melissa" is one person written last-name-first
  if (parts.length === 2 && parts.every((x) => !x.includes(' '))) return `${parts[1]} ${parts[0]}`;
  const sets = parts.map((x) => new Set(words(x)));
  const out = []; const seen = new Set();
  parts.forEach((name, i) => {
    const key = [...sets[i]].sort().join(' ');
    if (!key || seen.has(key)) return;
    // drop fragments like "Hill" when "Melissa Hill" is also listed
    if (sets.some((o, j) => j !== i && o.size > sets[i].size && [...sets[i]].every((w) => o.has(w)))) return;
    seen.add(key); out.push(name);
  });
  return out.join(', ');
}

// ---------- Apple Books (iTunes Search API) ----------
// Apple's search only answers other websites through "JSONP": a script tag that
// calls back into the page. About 20 lookups a minute are allowed, so it's only
// asked when Google and Open Library left a gap.
let jsonpSeq = 0;
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = `__lamplightApple${++jsonpSeq}`;
    const s = document.createElement('script');
    const done = () => { clearTimeout(timer); delete window[cb]; s.remove(); };
    const timer = setTimeout(() => { done(); reject(new Error('timeout')); }, TIMEOUT);
    window[cb] = (data) => { done(); resolve(data); };
    s.onerror = () => { done(); reject(new Error('Apple Books could not be reached')); };
    s.src = `${url}&callback=${cb}`;
    document.head.appendChild(s);
  });
}

const looseTitle = (t) => String(t || '').toLowerCase().replace(/\(.*?\)|:.*$/g, '').replace(/[^a-z0-9]/g, '');

function fromApple(it) {
  return {
    title: it.trackName || '',
    authors: it.artistName || '',
    about: stripHtml(it.description),
    genres: (it.genres || []).filter((g) => !/^(books|ebooks?)$/i.test(g)).slice(0, 4),
    cover: it.artworkUrl100 ? it.artworkUrl100.replace(/\/\d+x\d+(bb)?\.(jpg|png)$/i, '/600x600bb.jpg') : '',
  };
}

/** Apple Books details: by ISBN first, then by title + author with a careful match. */
async function appleBooks({ isbn, title, authors }) {
  try {
    if (isbn) {
      const d = await jsonp(`https://itunes.apple.com/lookup?isbn=${encodeURIComponent(cleanIsbn(isbn))}&country=US`);
      const it = (d.results || []).find((x) => x.trackName);
      if (it) return fromApple(it);
    }
    if (!title) return null;
    const firstAuthor = String(authors || '').split(',')[0].trim();
    const term = encodeURIComponent(`${title} ${firstAuthor}`.trim());
    const d = await jsonp(`https://itunes.apple.com/search?term=${term}&media=ebook&entity=ebook&limit=10&country=US`);
    const want = looseTitle(title);
    const surname = firstAuthor.toLowerCase().split(/\s+/).pop() || '';
    const it = (d.results || []).find((x) => {
      const got = looseTitle(x.trackName);
      const titleOk = got && want && (got === want || got.startsWith(want) || want.startsWith(got));
      const authorOk = !surname || String(x.artistName || '').toLowerCase().includes(surname);
      return titleOk && authorOk;
    });
    return it ? fromApple(it) : null;
  } catch (e) {
    return null;
  }
}

/** Fill gaps (description, cover, genres) from Apple Books without overwriting anything. */
async function fillFromApple(out) {
  if (out.about && out.cover && out.genres && out.genres.length) return out;
  const ap = await appleBooks(out);
  if (!ap) return out;
  if (!out.about && ap.about) out.about = ap.about;
  if (!out.cover && ap.cover) out.cover = ap.cover;
  if ((!out.genres || !out.genres.length) && ap.genres.length) out.genres = ap.genres;
  return out;
}

const sanePages = (n) => { const v = Number(n); return v >= 16 && v <= 5000 ? Math.round(v) : null; };

/** Merge an ISBN's two answers: edition facts from Open Library, the rest from Google. */
function mergeIsbn(g, o) {
  const pick = (...vals) => vals.find((v) => v != null && v !== '' && !(Array.isArray(v) && !v.length));
  g = g || {}; o = o || {};
  return {
    title: pick(g.title, o.title) || '',
    subtitle: pick(g.subtitle, o.subtitle) || '',
    authors: cleanAuthors(pick(g.authors, o.authors) || ''),
    about: pick(g.about) || '',
    pages: pick(sanePages(o.pages), sanePages(g.pages)) || null,
    genres: pick(g.genres, o.genres) || [],
    publisher: pick(o.publisher, g.publisher) || '',
    published: pick(o.published, g.published) || '',
    cover: pick(o.cover, g.cover) || '',
    isbn: pick(g.isbn, o.isbn) || '',
    _olKey: o._olKey || '',
  };
}

const isbnCache = new Map();

/** Full details for one ISBN, or null if neither database knows it. */
export async function lookupIsbn(isbnRaw) {
  const isbn = cleanIsbn(isbnRaw);
  if (!isbn) return null;
  if (isbnCache.has(isbn)) return { ...isbnCache.get(isbn) };
  const [g, o] = await Promise.allSettled([googleByIsbn(isbn), openLibraryByIsbn(isbn)]);
  const gv = g.status === 'fulfilled' ? g.value : null;
  const ov = o.status === 'fulfilled' ? o.value : null;
  if (!gv && !ov) {
    if (g.status === 'rejected' && o.status === 'rejected') throw new Error('Could not reach the book databases.');
    return null;
  }
  const result = mergeIsbn(gv, ov);
  result.isbn = isbn;
  await fillFromApple(result);
  if (!result.about && ov && ov._olKey) result.about = stripHtml(await openLibraryDescription(ov._olKey));
  delete result._olKey;
  result.isbn = isbn;
  // only remember complete answers (a database that timed out could leave gaps)
  if (g.status === 'fulfilled' && o.status === 'fulfilled') isbnCache.set(isbn, result);
  return { ...result };
}

/** Search by title, author or ISBN. Returns a list of candidate books. */
export async function searchBooks(query) {
  const q = query.trim();
  if (!q) return [];
  const asIsbn = extractIsbn(q);
  if (asIsbn && cleanIsbn(q).length >= 10) {
    const one = await lookupIsbn(asIsbn);
    return one ? [{ ...one, _full: true }] : [];
  }
  const enc = encodeURIComponent(q);
  const [g, o] = await Promise.allSettled([
    getJSON(`https://www.googleapis.com/books/v1/volumes?q=${enc}&maxResults=20&printType=books`),
    getJSON(`https://openlibrary.org/search.json?q=${enc}&limit=15&fields=key,title,subtitle,author_name,first_publish_year,isbn,cover_i,number_of_pages_median,subject,publisher`),
  ]);
  if (g.status === 'rejected' && o.status === 'rejected') throw new Error('Could not reach the book databases.');
  const results = [];
  const seen = new Set();
  const keyOf = (r) => `${r.title}|${r.authors}`.toLowerCase().replace(/[^a-z0-9|]/g, '');
  if (g.status === 'fulfilled') {
    (g.value.items || []).forEach((it) => {
      const r = { ...fromGoogle(it.volumeInfo), _full: true };
      if (!r.title || seen.has(keyOf(r))) return;
      seen.add(keyOf(r));
      results.push(r);
    });
  }
  if (o.status === 'fulfilled') {
    (o.value.docs || []).forEach((d) => {
      const r = {
        title: d.title || '',
        subtitle: d.subtitle || '',
        authors: (d.author_name || []).slice(0, 3).join(', '),
        published: d.first_publish_year ? String(d.first_publish_year) : '',
        pages: d.number_of_pages_median || null,
        isbn: (d.isbn || []).find((x) => x.length === 13) || (d.isbn || [])[0] || '',
        cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : '',
        genres: genresFromSubjects(d.subject || []),
        publisher: (d.publisher || [])[0] || '',
        _workKey: d.key,
      };
      if (!r.title || seen.has(keyOf(r))) return;
      seen.add(keyOf(r));
      results.push(r);
    });
  }
  return results;
}

/** Turn a search result into full details. With an ISBN, the exact-edition lookup wins. */
export async function completeResult(r) {
  let out = { ...r, authors: cleanAuthors(r.authors) };
  if (out.isbn) {
    try {
      const full = await lookupIsbn(out.isbn);
      if (full) {
        // edition facts come only from the ISBN lookup; keep the search result's text if the lookup has none
        out = { ...out, ...Object.fromEntries(Object.entries(full).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length))) };
        if (!full.pages) out.pages = null;
        if (!full.publisher) out.publisher = '';
      }
    } catch (e) { /* keep what we have */ }
  }
  if (!out.about && out._workKey) out.about = stripHtml(await openLibraryWorkDescription(out._workKey));
  if (!out.about || !out.cover) await fillFromApple(out);
  delete out._full; delete out._workKey; delete out._olKey;
  return out;
}

/** Find details for an existing book using its ISBN, or else its title + author. */
export async function lookupForBook(book) {
  if (book.isbn) {
    const r = await lookupIsbn(book.isbn);
    if (r) return r;
  }
  const list = await searchBooks(`${book.title} ${book.authors || ''}`.trim());
  if (!list.length) return null;
  return completeResult(list[0]);
}
