// sample.js: optional example books so you can explore every screen before
// adding your own. They are marked as samples and can be removed in one tap.
import { store, normalizeBook, uid, dateKey, todayKey } from './store.js';

const BOOKS = [
  { title: 'Frankenstein', subtitle: 'or, The Modern Prometheus', authors: 'Mary Shelley', pages: 280, genres: ['Classics', 'Horror', 'Science Fiction'], format: 'Paperback', ownership: 'Owned', status: 'reading', currentPage: 164, published: '1818',
    about: 'A young scientist builds a living being from salvaged parts, then abandons it in horror. Told through letters and nested confessions, the story follows creator and creation across Europe and the Arctic as each blames the other for the wreckage of their lives.' },
  { title: 'Pride and Prejudice', authors: 'Jane Austen', pages: 432, genres: ['Classics', 'Romance'], format: 'Hardcover', ownership: 'Owned', status: 'finished', rating: 4.75, published: '1813', finishedDaysAgo: 9,
    about: 'Elizabeth Bennet, quick-witted second of five daughters, keeps colliding with the proud and wealthy Mr. Darcy. A comedy of manners about first impressions, family embarrassment and the slow work of changing your mind.' },
  { title: 'Moby-Dick', authors: 'Herman Melville', pages: 635, genres: ['Classics', 'Adventure'], format: 'Ebook', ownership: 'Owned', status: 'toread', published: '1851',
    about: 'Ishmael signs on to a whaling ship whose captain, Ahab, is fixed on hunting the white whale that took his leg. Part sea story, part encyclopedia of whaling, part meditation on obsession.' },
  { title: 'The Great Gatsby', authors: 'F. Scott Fitzgerald', pages: 180, genres: ['Classics', 'Literary Fiction'], format: 'Audiobook', ownership: 'Borrowed', status: 'reading', progressMode: 'percent', percent: 38, published: '1925',
    about: 'Nick Carraway rents a cottage on Long Island next to the mansion of Jay Gatsby, whose lavish parties hide a single-minded hope of winning back Daisy Buchanan. A short, sharp novel about money, reinvention and the past.' },
  { title: 'Jane Eyre', authors: 'Charlotte Brontë', pages: 532, genres: ['Classics', 'Romance'], format: 'Paperback', ownership: 'Not Owned', status: 'wishlist', published: '1847',
    about: 'An orphaned governess takes a post at Thornfield Hall and falls for its brooding master, Mr. Rochester, while strange noises echo from the attic. A coming-of-age story driven by a narrator who insists on her own worth.' },
  { title: 'The Odyssey', authors: 'Homer', pages: 541, genres: ['Classics', 'Poetry', 'Mythology'], format: 'Paperback', ownership: 'Owned', status: 'dnf', currentPage: 120, rating: 2.5, published: '-700',
    about: 'After the fall of Troy, Odysseus spends ten years trying to get home to Ithaca, facing monsters, gods and his own crew, while suitors crowd his house and his wife Penelope stalls them.' },
];

export function loadSamples() {
  const d = store.data;
  const ids = {};
  const today = new Date();
  BOOKS.forEach((src, i) => {
    const { finishedDaysAgo, ...rest } = src;
    const b = normalizeBook({ ...rest, id: uid(), sample: true, addedAt: new Date(today - i * 86400000).toISOString() });
    if (b.status === 'reading') b.startedAt = dateKey(new Date(today - 20 * 86400000));
    if (b.status === 'finished') {
      b.finishedAt = dateKey(new Date(today - finishedDaysAgo * 86400000));
      b.startedAt = dateKey(new Date(today - (finishedDaysAgo + 14) * 86400000));
      b.currentPage = b.pages; b.percent = 100;
    }
    if (b.currentPage != null && b.pages) b.percent = Math.round(b.currentPage / b.pages * 1000) / 10;
    if (b.title === 'Frankenstein') b.notes.push({ id: uid(), text: 'The creature quoting Paradise Lost. He learned to read by listening through a wall.', page: 132, createdAt: new Date().toISOString() });
    d.books.push(b);
    ids[b.title] = b.id;
  });

  // ~3 weeks of reading history with a streak running up to yesterday
  const plan = [];
  for (let back = 23; back >= 1; back--) {
    if ([17, 12, 11].includes(back)) continue; // a few missed days
    const book = back > 9 ? 'Pride and Prejudice' : (back % 3 === 0 ? 'The Great Gatsby' : 'Frankenstein');
    const minutes = 15 + ((back * 7) % 35);
    plan.push({ back, book, minutes });
  }
  plan.forEach((p) => {
    const date = new Date(today); date.setDate(date.getDate() - p.back); date.setHours(20, 15, 0, 0);
    const pages = p.book === 'The Great Gatsby' ? 0 : Math.round(p.minutes * 0.75);
    d.logs.push({
      id: uid(), bookId: ids[p.book], date: dateKey(date), startedAt: date.toISOString(), seconds: p.minutes * 60,
      pages, fromPage: null, toPage: null, fromPct: null, toPct: null, type: 'session', note: '',
    });
  });
  const coll = { id: uid(), name: '19th-century classics', description: 'Working through the big ones.', color: '#6b4fb8', bookIds: [ids.Frankenstein, ids['Pride and Prejudice'], ids['Moby-Dick'], ids['Jane Eyre']], createdAt: new Date().toISOString() };
  d.collections.push(coll);
  store.save();
}

export function removeSamples() {
  const d = store.data;
  const sampleIds = new Set(d.books.filter((b) => b.sample).map((b) => b.id));
  d.books = d.books.filter((b) => !b.sample);
  d.logs = d.logs.filter((l) => !sampleIds.has(l.bookId));
  d.collections.forEach((c) => { c.bookIds = c.bookIds.filter((x) => !sampleIds.has(x)); });
  d.collections = d.collections.filter((c) => !(c.name === '19th-century classics' && c.bookIds.length === 0));
  if (d.active && sampleIds.has(d.active.bookId)) d.active = null;
  store.save();
}

export const hasSamples = () => store.data.books.some((b) => b.sample);
export { todayKey };
