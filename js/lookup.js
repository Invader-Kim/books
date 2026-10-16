// lookup.js: fills in book details from two free, keyless databases:
// Google Books (best for descriptions and genres) and Open Library (good for
// page counts and covers). Results from both are merged; anything still
// missing can be typed in by hand.

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

async function googleByIsbn(isbn) {
  const data = await getJSON(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`);
  const item = data.items && data.items[0];
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
    pages: r.number_of_pages || null,
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

function merge(primary, secondary) {
  const out = { ...(secondary || {}) };
  Object.entries(primary || {}).forEach(([k, v]) => {
    const empty = v == null || v === '' || (Array.isArray(v) && !v.length);
    if (!empty) out[k] = v;
  });
  // Open Library's large cover is sharper than Google's thumbnail
  if (secondary && secondary.cover) out.cover = secondary.cover;
  if (!out.genres || !out.genres.length) out.genres = (secondary && secondary.genres) || [];
  return out;
}

/** Full details for one ISBN, or null if neither database knows it. */
export async function lookupIsbn(isbnRaw) {
  const isbn = cleanIsbn(isbnRaw);
  if (!isbn) return null;
  const [g, o] = await Promise.allSettled([googleByIsbn(isbn), openLibraryByIsbn(isbn)]);
  const gv = g.status === 'fulfilled' ? g.value : null;
  const ov = o.status === 'fulfilled' ? o.value : null;
  if (!gv && !ov) {
    if (g.status === 'rejected' && o.status === 'rejected') throw new Error('Could not reach the book databases.');
    return null;
  }
  const result = merge(gv, ov);
  if (!result.about && ov && ov._olKey) result.about = stripHtml(await openLibraryDescription(ov._olKey));
  delete result._olKey;
  result.isbn = result.isbn || isbn;
  return result;
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

/** Turn a search result into full details (adds description etc. if missing). */
export async function completeResult(r) {
  let out = { ...r };
  if (!out.about && out.isbn) {
    try { const full = await lookupIsbn(out.isbn); if (full) out = merge(out, full); } catch (e) { /* keep what we have */ }
  }
  if (!out.about && out._workKey) out.about = stripHtml(await openLibraryWorkDescription(out._workKey));
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
