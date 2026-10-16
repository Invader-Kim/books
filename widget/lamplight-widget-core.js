// Lamplight Widget: the widget itself (runs inside Scriptable).
// You don't paste this file. The small loader you paste into Scriptable
// (widget/lamplight-widget.js) downloads this file from your site and runs it,
// so widget fixes reach your phone without pasting again. Scriptable's
// `args`, `config` and other globals are available here as usual.

const APP_URL = 'https://invader-kim.github.io/books/';
const fm = FileManager.local();
const DATA_PATH = fm.joinPath(fm.documentsDirectory(), 'lamplight-widget.json');

const C = {
  bg: new Color('#0a1530'), bg2: new Color('#12214a'), track: new Color('#071026'),
  text: new Color('#eaf0ff'), muted: new Color('#9fb0d6'), faint: new Color('#6f80a8'),
  gold: new Color('#f6c065'), teal: new Color('#62d6c4'), sky: new Color('#7fb8ff'), coral: new Color('#ff8f78'),
};

// ---------- receive data from Lamplight ----------
// (sent by the Update widget button as ?data=… on the scriptable:///run link)
const incoming = args.queryParameters && args.queryParameters.data;
if (incoming) {
  try {
    const parsed = JSON.parse(incoming);
    fm.writeString(DATA_PATH, JSON.stringify(parsed));
    const a = new Alert();
    a.title = 'Widget updated';
    a.message = 'Your Lamplight widget will refresh shortly. Tap "◀ Lamplight" at the top-left to go back.';
    a.addAction('Done');
    await a.presentAlert();
  } catch (e) {
    const a = new Alert();
    a.title = "Couldn't read the data";
    a.message = String(e);
    a.addAction('OK');
    await a.presentAlert();
  }
}

// ---------- helpers ----------
function load() {
  try { return fm.fileExists(DATA_PATH) ? JSON.parse(fm.readString(DATA_PATH)) : null; } catch (e) { return null; }
}
const pad = (n) => String(n).padStart(2, '0');
function keys(d = new Date()) {
  return { day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, month: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, year: String(d.getFullYear()) };
}
/** Numbers saved yesterday shouldn't show as today's, so reset anything from an older period. */
function current(d) {
  const k = keys();
  return {
    todayMin: d.day === k.day ? d.todayMin : 0,
    readToday: d.day === k.day ? d.readToday : false,
    monthDone: d.month === k.month ? d.monthDone : 0,
    yearDone: d.year === k.year ? d.yearDone : 0,
    // a streak saved today or yesterday can still be alive; anything older has lapsed
    streak: (d.day === k.day || d.day === keys(new Date(Date.now() - 864e5)).day) ? d.streak : 0,
  };
}

function ring(value, max, color, size = 120, line = 14) {
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const r = (size - line) / 2; const cx = size / 2; const cy = size / 2;
  const arc = (from, to) => {
    const p = new Path();
    const steps = Math.max(2, Math.ceil((to - from) * 60));
    for (let i = 0; i <= steps; i++) {
      const a = (-Math.PI / 2) + (from + (to - from) * (i / steps)) * Math.PI * 2;
      const pt = new Point(cx + r * Math.cos(a), cy + r * Math.sin(a));
      if (i === 0) p.move(pt); else p.addLine(pt);
    }
    return p;
  };
  ctx.setLineWidth(line);
  ctx.setStrokeColor(C.track);
  ctx.addPath(arc(0, 1)); ctx.strokePath();
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  if (pct > 0) {
    ctx.setStrokeColor(color);
    ctx.addPath(arc(0, pct)); ctx.strokePath();
    // rounded ends
    ctx.setFillColor(color);
    const dot = (t) => {
      const a = (-Math.PI / 2) + t * Math.PI * 2;
      ctx.fillEllipse(new Rect(cx + r * Math.cos(a) - line / 2, cy + r * Math.sin(a) - line / 2, line, line));
    };
    dot(0); dot(pct);
  }
  return ctx.getImage();
}

function goalStack(parent, label, value, max, unit, color, ringSize) {
  // every row in the column is the same width and centered, so the label sits
  // exactly under the middle of its ring
  const W = ringSize + 16;
  const s = parent.addStack();
  s.layoutVertically();
  s.size = new Size(W, 0);
  const centered = (h) => { const r = s.addStack(); r.size = new Size(W, h); r.centerAlignContent(); r.addSpacer(); return r; };

  const ringWrap = centered(ringSize);
  const ringRow = ringWrap.addStack();
  ringWrap.addSpacer();
  ringRow.size = new Size(ringSize, ringSize);
  ringRow.backgroundImage = ring(value, max, color, ringSize * 2, ringSize * 0.24);
  ringRow.layoutVertically();
  ringRow.addSpacer();
  const vRow = ringRow.addStack(); vRow.addSpacer();
  const v = vRow.addText(String(Math.round(value)));
  v.font = Font.boldRoundedSystemFont(ringSize * 0.3); v.textColor = C.text; v.centerAlignText();
  vRow.addSpacer();
  const mRow = ringRow.addStack(); mRow.addSpacer();
  const m = mRow.addText(`of ${max}${unit}`);
  m.font = Font.semiboldRoundedSystemFont(ringSize * 0.14); m.textColor = C.muted; m.lineLimit = 1; m.minimumScaleFactor = 0.6; m.centerAlignText();
  mRow.addSpacer();
  ringRow.addSpacer();

  s.addSpacer(5);
  const lRow = centered(0);
  const l = lRow.addText(String(label).toUpperCase());
  l.font = Font.heavyRoundedSystemFont(9); l.textColor = C.muted; l.lineLimit = 1; l.minimumScaleFactor = 0.7; l.centerAlignText();
  lRow.addSpacer();
  return s;
}

function bar(pct, width, height = 6) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height); ctx.opaque = false; ctx.respectScreenScale = true;
  const p1 = new Path(); p1.addRoundedRect(new Rect(0, 0, width, height), height / 2, height / 2);
  ctx.addPath(p1); ctx.setFillColor(C.track); ctx.fillPath();
  if (pct > 0) {
    const w = Math.max(height, width * Math.min(1, pct / 100));
    const p2 = new Path(); p2.addRoundedRect(new Rect(0, 0, w, height), height / 2, height / 2);
    ctx.addPath(p2); ctx.setFillColor(C.gold); ctx.fillPath();
  }
  return ctx.getImage();
}

async function cover(url) {
  if (!url || !/^https:\/\//.test(url)) return null;
  try { const req = new Request(url); req.timeoutInterval = 6; return await req.loadImage(); } catch (e) { return null; }
}

function bookBlock(parent, b, width, big) {
  const s = parent.addStack();
  s.layoutVertically();
  const t = s.addText(b.title || 'Untitled');
  t.font = new Font('Georgia-Bold', big ? 17 : 15); t.textColor = C.text; t.lineLimit = 2; t.minimumScaleFactor = 0.8;
  if (b.author) {
    s.addSpacer(2);
    const a = s.addText(b.author); a.font = Font.mediumRoundedSystemFont(11); a.textColor = C.muted; a.lineLimit = 1;
  }
  s.addSpacer(6);
  const img = s.addImage(bar(b.pct || 0, width));
  img.imageSize = new Size(width, 6);
  s.addSpacer(4);
  const p = s.addText(b.progress || ''); p.font = Font.semiboldRoundedSystemFont(11); p.textColor = C.faint;
  return s;
}

function background(w) {
  const g = new LinearGradient();
  g.colors = [new Color('#1a2d5f'), C.bg];
  g.locations = [0, 1];
  g.startPoint = new Point(0, 0); g.endPoint = new Point(0.6, 1);
  w.backgroundGradient = g;
}

// ---------- build ----------
async function build() {
  const d = load();
  const fam = config.widgetFamily || 'medium';
  const w = new ListWidget();
  background(w);
  // iOS can't open a Home Screen web app from a widget, so this opens Safari;
  // Lamplight shows a note there pointing back to the Home Screen app
  w.url = `${APP_URL}?from=widget`;
  w.setPadding(14, 14, 14, 14);
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

  if (!d) {
    const t = w.addText('Lamplight');
    t.font = new Font('Georgia-Bold', 18); t.textColor = C.gold;
    w.addSpacer(6);
    const m = w.addText('Open Lamplight › Settings and tap "Update widget".');
    m.font = Font.mediumRoundedSystemFont(12); m.textColor = C.muted;
    return w;
  }
  const n = current(d);
  const book = (d.reading || [])[0];

  // header: greeting + streak
  const head = w.addStack();
  head.centerAlignContent();
  const h = head.addText(d.name ? `Hi, ${d.name}` : 'Lamplight');
  h.font = Font.heavyRoundedSystemFont(12); h.textColor = C.gold; h.lineLimit = 1;
  head.addSpacer();
  if (n.streak && fam !== 'small') {
    const st = head.addText(`🔥 ${n.streak}`); st.font = Font.boldRoundedSystemFont(12); st.textColor = C.coral;
  }
  w.addSpacer(fam === 'small' ? 6 : 8);

  if (fam === 'small') {
    if (book) {
      bookBlock(w, book, 130, false);
      w.addSpacer();
    } else {
      w.addSpacer();
    }
    const row = w.addStack(); row.centerAlignContent();
    const r = row.addImage(ring(n.todayMin, d.dailyGoal, C.gold, 60, 9)); r.imageSize = new Size(28, 28);
    row.addSpacer(6);
    const tt = row.addText(`${Math.round(n.todayMin)} / ${d.dailyGoal} min today`);
    tt.font = Font.semiboldRoundedSystemFont(11); tt.textColor = C.muted; tt.lineLimit = 1; tt.minimumScaleFactor = 0.7;
    return w;
  }

  // medium & large
  const body = w.addStack();
  body.centerAlignContent();
  if (book) {
    const img = await cover(book.cover);
    if (img) {
      const c = body.addImage(img); c.imageSize = new Size(52, 78); c.cornerRadius = 8;
      body.addSpacer(10);
    }
    bookBlock(body, book, img ? 110 : 160, false);
  } else {
    const e = body.addText('Nothing on the go.\nPick your next read!'); e.font = Font.mediumRoundedSystemFont(13); e.textColor = C.muted;
  }
  body.addSpacer();

  const goals = fam === 'large' ? null : body.addStack();
  const ringSize = 46;
  const addGoals = (parent, size) => {
    goalStack(parent, 'Today', n.todayMin, d.dailyGoal, ' min', C.gold, size);
    if (d.monthGoal) { parent.addSpacer(8); goalStack(parent, d.monthName || 'Month', n.monthDone, d.monthGoal, '', C.teal, size); }
    parent.addSpacer(8);
    goalStack(parent, d.year || 'Year', n.yearDone, d.yearGoal, '', C.sky, size);
  };
  if (goals) { addGoals(goals, ringSize); return w; }

  // large: goals row + more books
  w.addSpacer(16);
  const gl = w.addText('GOALS'); gl.font = Font.heavyRoundedSystemFont(11); gl.textColor = C.muted;
  w.addSpacer(8);
  const gRow = w.addStack(); gRow.addSpacer(); addGoals(gRow, 64); gRow.addSpacer();
  const more = (d.reading || []).slice(1, 3);
  if (more.length) {
    w.addSpacer(14);
    const ml = w.addText('ALSO READING'); ml.font = Font.heavyRoundedSystemFont(11); ml.textColor = C.muted;
    more.forEach((b) => {
      w.addSpacer(6);
      const r = w.addStack(); r.centerAlignContent();
      const t = r.addText(b.title); t.font = new Font('Georgia-Bold', 13); t.textColor = C.text; t.lineLimit = 1;
      r.addSpacer();
      const p = r.addText(b.pct != null ? `${Math.round(b.pct)}%` : ''); p.font = Font.semiboldRoundedSystemFont(12); p.textColor = C.faint;
    });
  }
  w.addSpacer();
  const up = w.addText(`Updated ${new Date(d.updatedAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`);
  up.font = Font.mediumRoundedSystemFont(10); up.textColor = C.faint;
  return w;
}

if (!incoming) {
  const widget = await build();
  if (config.runsInWidget) Script.setWidget(widget);
  else await widget.presentMedium();
}
Script.complete();
