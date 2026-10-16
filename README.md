# Lamplight Library

Your personal book tracker. It runs in Safari, installs to your iPhone's Home Screen, and works offline. Your data stays on your phone.

---

## 1. Put it online (one time, about 5 minutes)

The app is a folder of plain files. iPhones only allow offline apps and camera access on a secure (https) web address, so the folder needs a free home on the web first. Pick one option.

### Option A: Netlify Drop (easiest, from any computer)

1. Unzip `lamplight.zip` so you have a folder called `lamplight`.
2. On a computer, go to **https://app.netlify.com/drop**.
3. Drag the whole `lamplight` folder onto the page.
4. Netlify gives you a link like `https://something-random.netlify.app`. Open it to check it works.
5. **Sign up for a free account when it offers, and claim the site**, so it stays online. You can rename the address in Site settings (e.g. `kims-books.netlify.app`).

### Option B: GitHub Pages (free, also works from Windows)

1. Make a free account at github.com and create a new **public** repository, e.g. `books`.
2. Click **Add file → Upload files** and drag in everything *inside* the `lamplight` folder (index.html, styles.css, sw.js, manifest.webmanifest and the `js`, `vendor`, `icons` folders). Commit.
3. Go to **Settings → Pages**, set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**, and save.
4. After a minute your app is at `https://YOUR-USERNAME.github.io/books/`.

Only you will use it, but anyone who has the link could open the empty app. They can't see your books, because your books live only on your phone.

## 2. Install it on your iPhone

1. Open your link in **Safari** (not Chrome; iOS only installs Home Screen apps from Safari).
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Open Lamplight from the new icon. It runs full screen, and after this first launch it works with no internet.
4. The first time you scan, allow camera access.

## 3. Keep your library safe

Your books are stored in the app's private storage on the phone. Deleting the app from your Home Screen, clearing Safari website data, or switching phones erases it.

**Settings → Save a backup** creates a file. Save it to iCloud Drive or Files. **Settings → Restore from a backup** brings it all back on any phone.

---

## What's inside

| File | What it does |
|---|---|
| `index.html` | The page shell: tab bar, icon links, iPhone settings |
| `styles.css` | All the visual design (colors, rounded shapes, layout) |
| `js/app.js` | Every screen and button: Home, Library, book pages, Collections, Stats, Settings, timer, all the forms |
| `js/store.js` | Your data: books, collections, reading log, goals; saving to the phone |
| `js/lookup.js` | Fetches book details from Google Books and Open Library, and reads ISBNs |
| `js/scanner.js` | Camera barcode and QR code scanning |
| `js/stats.js` | Streaks, daily totals, reading speed, yearly numbers |
| `js/ui.js` | Shared pieces: covers, stars, rings, pop-up sheets, messages |
| `js/sample.js` | The optional example books |
| `sw.js` | The service worker: saves the app on the phone so it opens offline, and keeps book covers |
| `manifest.webmanifest` | Name, icon and colors used when installed |
| `vendor/html5-qrcode.min.js` | Open-source barcode reader (Apache 2.0 license, included) |
| `icons/` | Home Screen icons |

## Changing the app later

1. Edit the files (or ask Claude to).
2. Open `sw.js` and change `VERSION` (e.g. `lamplight-v1.0.1`). This tells phones there is a new copy.
3. Upload the changed files to the same place (drag the folder onto your Netlify site's **Deploys** page, or upload to GitHub again).
4. Next time you open the app with internet, a message says **A new version is ready**. Tap **Update**. Your books are untouched.

## Good to know

- **Scanning reads the ISBN barcode** on the back cover (the bars starting 978 or 979) and QR codes that contain an ISBN. If a code can't be read, type the ISBN or scan a photo.
- **Looking up details needs internet.** Offline, a scan saves the ISBN; later tap **Fill in missing details** on the book.
- **Some books aren't in either database**, or have wrong page counts. Every field can be edited by hand, and you can add your own cover photo.
- **Reading speed** uses sessions or progress updates that include both time and pages.
- **Streaks** count any day with logged reading. If you haven't read yet today, yesterday still keeps the streak alive.
- **Goals:** books count toward a month or year by their finish date.
