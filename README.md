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
| `js/celebrate.js` | The full-screen "Goal reached" celebration with confetti |
| `widget/lamplight-widget.js` | The small script you paste into the Scriptable app for the Home Screen widget |
| `widget/lamplight-widget-core.js` | The widget itself; the pasted script downloads it, so widget fixes need no re-paste |
| `sw.js` | The service worker: saves the app on the phone so it opens offline, and keeps book covers |
| `manifest.webmanifest` | Name, icon and colors used when installed |
| `vendor/html5-qrcode.min.js` | Open-source barcode reader (Apache 2.0 license, included) |
| `icons/` | Home Screen icons |

## Changing the app later

1. Edit the files (or ask Claude to).
2. Open `sw.js` and change `VERSION` (e.g. `lamplight-v1.5.1`), and `APP_VERSION` at the top of `js/app.js` to match. This tells phones there is a new copy.
3. Upload the changed files to the same place (or push them to the GitHub repo).
4. Next time you open the app with internet, it updates itself and reloads once. If it doesn't, swipe it away in the app switcher and open it again. The version number is at the bottom of Settings. Your books are untouched.

## Good to know

- **Scanning reads the ISBN barcode** on the back cover (the bars starting 978 or 979) and QR codes that contain an ISBN. If a code can't be read, type the ISBN or scan a photo.
- **Looking up details needs internet.** Offline, a scan saves the ISBN; later tap **Fill in missing details** on the book.
- **Some books aren't in either database**, or have wrong page counts. Every field can be edited by hand, and you can add your own cover photo.
- **Reading speed** uses sessions or progress updates that include both time and pages.
- **Streaks** count any day with logged reading. If you haven't read yet today, yesterday still keeps the streak alive.
- **Goals:** daily reading minutes and books per year. Books count toward the year they were finished. Reaching a goal shows a celebration, once per day or year.
- **Your name** is asked on first launch and can be changed in Settings.
- **Search tab:** results stay on the page while you check a book's details or add several. Tap **+** on a result to add it straight away (search a series name to add a whole series), or tap the book to review it first. Search sticks to English editions unless you turn that off in Settings.
- **Adding several books:** in Scan, turn on **Keep scanning** to add a shelf of books one after another.
- **Where details come from:** Google Books, Open Library and, for anything still missing, Apple Books. Goodreads and Amazon don't let apps read their data, so each book page has links to look it up there.
- **Library order:** sort by recently added, recently updated, title, author, rating, or **My order**, where you drag books by the ⠿ handle. Your choice is remembered. Collections can be sorted the same way: the Collections tab (my order, name, most books, newest) and the books inside each collection (my order, title, author, recently added, rating, reading status).
- **Book details stay put.** Details you save are remembered by ISBN, so deleting and re-adding a book brings back your corrections.

## Reading in Apple Books

For books with the format **Ebook**, Lamplight shows **Read in Apple Books**, and starting a reading session can open Books for you (Settings › Apple Books). By default it opens your Books library. Apple offers no link to a specific EPUB or PDF you added yourself, so for "the book" mode Lamplight runs a one-time Shortcut called **Open in Books** that searches your Books library for the title. Setup steps are in Settings. If a PDF is named differently in Books, fill in the book's **Name in Apple Books** field. You can also set the default format for new books to Ebook there.

## Home Screen widget

Apple only lets App Store apps make widgets, so Lamplight's widget runs in the free **Scriptable** app. Steps are in **Settings › iPhone widget**: copy the widget script, paste it into a new Scriptable script named **Lamplight Widget**, add a Scriptable widget to your Home Screen and pick that script, then tap **Update widget** in Lamplight whenever you want fresh numbers. Tapping the widget opens Safari, not the Home Screen app (an iOS limit); Safari shows a note pointing back to the app.

## Known iOS quirk

On some iOS 26 versions the tab bar sits slightly above the bottom edge in the Home Screen app. This comes from iOS sizing web apps short of the screen and can't be fixed from the app.
