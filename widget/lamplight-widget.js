// Lamplight Widget for Scriptable (https://scriptable.app)
// ---------------------------------------------------------------------------
// Paste this into a new Scriptable script named exactly:  Lamplight Widget
// Then add a Scriptable widget to your Home Screen and pick this script.
// In Lamplight, tap Settings › Update widget to send your numbers.
//
// This is a small loader: it downloads the latest widget design from your
// Lamplight site and keeps a copy, so the widget still works offline and
// future widget fixes arrive without pasting again.

const CORE_URL = 'https://invader-kim.github.io/books/widget/lamplight-widget-core.js';
const lfm = FileManager.local();
const corePath = lfm.joinPath(lfm.documentsDirectory(), 'lamplight-widget-core.js');

let code = null;
try {
  const req = new Request(`${CORE_URL}?t=${Date.now()}`);
  req.timeoutInterval = 8;
  const text = await req.loadString();
  if (req.response && req.response.statusCode === 200 && text.includes('Lamplight Widget')) {
    code = text;
    lfm.writeString(corePath, text);
  }
} catch (e) { /* offline: use the saved copy */ }
if (!code && lfm.fileExists(corePath)) code = lfm.readString(corePath);

if (code) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction(code)();
} else {
  const w = new ListWidget();
  w.backgroundColor = new Color('#0a1530');
  const t = w.addText('Lamplight widget needs internet once to finish setting up.');
  t.textColor = new Color('#9fb0d6');
  t.font = Font.mediumRoundedSystemFont(12);
  if (config.runsInWidget) Script.setWidget(w); else await w.presentSmall();
  Script.complete();
}
