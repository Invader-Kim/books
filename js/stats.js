// stats.js: turns your reading log into streaks, daily totals and speed.
import { store, dateKey, parseKey, todayKey } from './store.js';

/** Map of 'YYYY-MM-DD' -> { seconds, pages, books: Map(bookId -> {seconds, pages}) } */
export function byDay(logs = store.data.logs) {
  const days = new Map();
  logs.forEach((l) => {
    if (!l.date) return;
    let d = days.get(l.date);
    if (!d) { d = { seconds: 0, pages: 0, books: new Map() }; days.set(l.date, d); }
    d.seconds += l.seconds || 0;
    d.pages += l.pages || 0;
    const b = d.books.get(l.bookId) || { seconds: 0, pages: 0, entries: 0 };
    b.seconds += l.seconds || 0;
    b.pages += l.pages || 0;
    b.entries += 1;
    d.books.set(l.bookId, b);
  });
  return days;
}

const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };

export function streaks(days = byDay()) {
  const active = (k) => days.has(k);
  // current: counts back from today; if you haven't read yet today, yesterday still keeps it alive
  let cursor = new Date();
  if (!active(dateKey(cursor))) cursor = addDays(cursor, -1);
  let current = 0;
  while (active(dateKey(cursor))) { current += 1; cursor = addDays(cursor, -1); }

  const keys = [...days.keys()].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  keys.forEach((k) => {
    const d = parseKey(k);
    if (prev && dateKey(addDays(prev, 1)) === k) run += 1; else run = 1;
    longest = Math.max(longest, run);
    prev = d;
  });
  return { current, longest, readToday: active(todayKey()) };
}

/** Average speed across timed entries that also moved pages forward. */
export function speed(logs = store.data.logs) {
  let secs = 0; let pages = 0; let sessions = 0; let sessionSecs = 0;
  logs.forEach((l) => {
    if (l.type === 'session' && l.seconds > 0) { sessions += 1; sessionSecs += l.seconds; }
    if (l.seconds >= 60 && l.pages > 0) { secs += l.seconds; pages += l.pages; }
  });
  const pagesPerHour = secs > 0 ? pages / (secs / 3600) : null;
  return {
    pagesPerHour,
    minutesPerPage: pages > 0 ? (secs / 60) / pages : null,
    avgSessionMin: sessions ? sessionSecs / sessions / 60 : null,
    sessions,
  };
}

export function bookTotals(bookId) {
  const logs = store.data.logs.filter((l) => l.bookId === bookId);
  const seconds = logs.reduce((a, l) => a + (l.seconds || 0), 0);
  const sp = speed(logs);
  return { seconds, logs, pagesPerHour: sp.pagesPerHour };
}

export function minutesOn(key) {
  return store.data.logs.filter((l) => l.date === key).reduce((a, l) => a + (l.seconds || 0), 0) / 60;
}

export function finishedIn(year, month /* 0-11 or null */) {
  return store.data.books.filter((b) => {
    if (b.status !== 'finished' || !b.finishedAt) return false;
    const d = parseKey(b.finishedAt);
    return d.getFullYear() === year && (month == null || d.getMonth() === month);
  });
}

export function yearTotals(year) {
  const prefix = `${year}-`;
  let seconds = 0; let pages = 0;
  store.data.logs.forEach((l) => { if (l.date && l.date.startsWith(prefix)) { seconds += l.seconds || 0; pages += l.pages || 0; } });
  const finished = finishedIn(year, null);
  const rated = finished.filter((b) => b.rating > 0);
  return {
    seconds, pages, finished: finished.length,
    avgRating: rated.length ? rated.reduce((a, b) => a + b.rating, 0) / rated.length : null,
    perMonth: Array.from({ length: 12 }, (_, m) => finishedIn(year, m).length),
  };
}

/** Heat level 0–4 for a day, scaled against your daily minute goal (or pages when no time was logged). */
export function heatLevel(day, goalMin) {
  if (!day) return 0;
  const min = day.seconds / 60;
  const goal = Math.max(5, goalMin || 30);
  let ratio = min > 0 ? min / goal : Math.min(1, day.pages / 30) * 0.75;
  if (ratio <= 0) return 1;
  if (ratio < 0.34) return 1;
  if (ratio < 0.67) return 2;
  if (ratio < 1) return 3;
  return 4;
}
