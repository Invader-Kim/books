// scanner.js: reads book barcodes (the ISBN "EAN-13" bars on the back cover)
// and QR codes with the camera, using the open-source html5-qrcode library.
// The library is stored in the app folder so it works offline, and it is only
// loaded the first time you open the scanner.

let libPromise = null;
let scanner = null;

function loadLib() {
  if (window.Html5Qrcode) return Promise.resolve();
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/html5-qrcode.min.js';
      s.onload = () => resolve();
      s.onerror = () => { libPromise = null; reject(new Error('Scanner could not load.')); };
      document.head.appendChild(s);
    });
  }
  return libPromise;
}

function formats() {
  const F = window.Html5QrcodeSupportedFormats;
  return [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.QR_CODE, F.CODE_128];
}

function makeScanner(elementId) {
  return new window.Html5Qrcode(elementId, {
    formatsToSupport: formats(),
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    verbose: false,
  });
}

export async function startScanner(elementId, onCode) {
  await loadLib();
  await stopScanner();
  scanner = makeScanner(elementId);
  let done = false;
  await scanner.start(
    { facingMode: 'environment' },
    {
      fps: 12,
      aspectRatio: 4 / 3,
      qrbox: (w, h) => ({ width: Math.round(Math.min(w * 0.86, 360)), height: Math.round(Math.min(h * 0.55, 200)) }),
    },
    (text) => {
      if (done) return;
      done = true;
      if (navigator.vibrate) navigator.vibrate(40);
      onCode(text);
    },
    () => {},
  );
}

export async function stopScanner() {
  if (!scanner) return;
  const s = scanner;
  scanner = null;
  try { if (s.isScanning) await s.stop(); } catch (e) { /* already stopped */ }
  try { s.clear(); } catch (e) { /* ignore */ }
}

/** Read a barcode or QR code from a photo (useful if live camera access is blocked). */
export async function scanImageFile(file, elementId) {
  await loadLib();
  const s = makeScanner(elementId);
  try {
    return await s.scanFile(file, false);
  } finally {
    try { s.clear(); } catch (e) { /* ignore */ }
  }
}
