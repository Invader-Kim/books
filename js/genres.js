// genres.js: one tidy list of genres to pick from.
// The book databases describe books with hundreds of loose subject tags
// ("Man-woman relationships", "Fiction / General", "Gifts"...). Lamplight keeps
// a fixed list instead, plus any genres you add yourself (store.data.customGenres).
// Tags from the databases are translated onto this list; anything that doesn't
// match is dropped rather than cluttering your genres.
import { store } from './store.js';

export const GENRE_GROUPS = [
  {
    name: 'Fiction',
    list: ['Literary Fiction', 'Classics', 'Contemporary', 'Romance', 'Fantasy', 'Science Fiction', 'Dystopian',
      'Mystery', 'Thriller', 'Horror', 'Historical Fiction', 'Adventure', 'Humor', 'Short Stories',
      'Young Adult', "Children's", 'Graphic Novels', 'Poetry', 'Mythology'],
  },
  {
    name: 'Nonfiction',
    list: ['Biography', 'Memoir', 'History', 'True Crime', 'Self-Help', 'Psychology', 'Business',
      'Science', 'Philosophy', 'Religion & Spirituality', 'Politics', 'Health & Wellness', 'Travel',
      'Essays', 'Art & Design', 'Cookbooks'],
  },
];
export const BUILT_IN_GENRES = GENRE_GROUPS.flatMap((g) => g.list);

/** Everything you can pick from: the built-in list plus your own additions. */
export function genreList(customGenres = store.data.customGenres) {
  const custom = (customGenres || []).filter((g) => !BUILT_IN_GENRES.some((b) => b.toLowerCase() === g.toLowerCase()));
  return [...BUILT_IN_GENRES, ...custom];
}

// Database wording -> genre on the list. Checked in order; one tag can match several.
const RULES = [
  [/young adult|\bya\b|\bteens?\b/i, 'Young Adult'],
  [/juvenile|children|picture book|middle grade/i, "Children's"],
  [/graphic novel|comic|manga/i, 'Graphic Novels'],
  [/science fiction|sci-?fi|space opera|cyberpunk/i, 'Science Fiction'],
  [/dystopi|post-?apocalyptic/i, 'Dystopian'],
  [/fantasy|magic|dragons|fairy tales?/i, 'Fantasy'],
  [/romance|love stor|man-woman relationship/i, 'Romance'],
  [/myster|detective|crime fiction|whodunit|cozy/i, 'Mystery'],
  [/thriller|suspense/i, 'Thriller'],
  [/horror|ghost stor/i, 'Horror'],
  [/historical fiction|historical novel|^historical$/i, 'Historical Fiction'],
  [/adventure|\baction\b/i, 'Adventure'],
  [/humou?r|comedy|satire/i, 'Humor'],
  [/short stor/i, 'Short Stories'],
  [/poetry|poems/i, 'Poetry'],
  [/myth|legend|folklore/i, 'Mythology'],
  [/classic/i, 'Classics'],
  [/literary/i, 'Literary Fiction'],
  [/contemporary|women'?s fiction|domestic fiction|family life/i, 'Contemporary'],
  [/true crime/i, 'True Crime'],
  [/memoir|autobiograph/i, 'Memoir'],
  [/biograph/i, 'Biography'],
  [/^history$|world history|military history|^history,/i, 'History'],
  [/self-?help|personal development|motivation|self-improvement/i, 'Self-Help'],
  [/psycholog/i, 'Psychology'],
  [/business|economics|finance|management|leadership|entrepreneur/i, 'Business'],
  [/^science$|^science,|physics|biology|chemistry|astronomy|mathematics/i, 'Science'],
  [/philosoph/i, 'Philosophy'],
  [/religio|spiritual|christian|bible|faith|mind & spirit/i, 'Religion & Spirituality'],
  [/politic|government|social science/i, 'Politics'],
  [/health|fitness|wellness|diet|nutrition/i, 'Health & Wellness'],
  [/travel/i, 'Travel'],
  [/essay/i, 'Essays'],
  [/\bart\b|design|photography|architecture/i, 'Art & Design'],
  [/cook|recipe|food/i, 'Cookbooks'],
];

/** Turn database tags (or old free-typed genres) into genres from the list. */
export function toListGenres(tags = [], customGenres = undefined) {
  const list = genreList(customGenres);
  const out = [];
  const add = (g) => { if (g && !out.includes(g)) out.push(g); };
  (Array.isArray(tags) ? tags : [tags]).forEach((raw) => {
    String(raw || '').split(/\s*[/,]\s*/).forEach((part) => {
      const tag = part.trim();
      if (!tag) return;
      const exact = list.find((g) => g.toLowerCase() === tag.toLowerCase());
      if (exact) { add(exact); return; }
      RULES.forEach(([re, g]) => { if (re.test(tag)) add(g); });
    });
  });
  return out.slice(0, 5);
}
