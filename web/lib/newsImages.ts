/**
 * Pictures for the news cards: photos from Unsplash, chosen by what a
 * headline is about.
 *
 * The publishers' own pictures (CNBC's, usually from photo agencies) are not
 * shown: they are licensed to the publisher, not to us. These are under the
 * Unsplash licence, which allows commercial use without asking or crediting.
 * They are illustrations of the topic, not of the article. Loaded straight
 * from Unsplash's image CDN, sized there, so nothing is stored or served by
 * this site. Only free photos (images.unsplash.com), none from Unsplash+.
 *
 * The photographer is kept with each photo, for the record.
 */
interface Photo {
  id: string;
  by: string;
}

interface Topic {
  /** Matched against the headline, case-insensitively, on word starts. */
  words: RegExp;
  photos: Photo[];
}

const TOPICS: Topic[] = [
  // Before the Fed, so "mortgage rates" is about housing; and without
  // "house", which is as often the chamber.
  {
    words: /\b(housing|homes?\b|home (sales|prices|builders?)|homebuy|mortgage|real estate|rents?\b)/i,
    photos: [
      { id: "photo-1524813686514-a57563d77965", by: "Tom Rumble" },
      { id: "photo-1567496898669-ee935f5f647a", by: "Marcus Lenk" },
    ],
  },
  {
    words: /\b(fed|federal reserve|powell|rate cut|rate hike|rates?\b|central bank|fomc|monetary)/i,
    photos: [
      { id: "photo-1542320728179-bda01e6f5c73", by: "Alex Bierwagen" },
      { id: "photo-1783571856194-004fac25c615", by: "Yang-Chen Lin" },
      { id: "photo-1633059050703-0f1b50828402", by: "Joshua Woroniecki" },
    ],
  },
  {
    words: /\b(crypto|bitcoin|ether|stablecoin|blockchain|coinbase)/i,
    photos: [
      { id: "photo-1518546305927-5a555bb7020d", by: "André François McKenzie" },
      { id: "photo-1640161704729-cbe966a08476", by: "Traxer" },
    ],
  },
  {
    words: /\b(oil|crude|opec|gasoline|gas prices|energy|natural gas|refin|drill)/i,
    photos: [
      { id: "photo-1516199423456-1f1e91b06f25", by: "Zbynek Burival" },
      { id: "photo-1777195148867-68a6f0e9aa8f", by: "Alpha Perspective" },
    ],
  },
  {
    words: /\b(chip|semiconductor|nvidia|ai\b|artificial intelligence|tech|software|apple|microsoft|google|alphabet|meta|amazon)/i,
    photos: [
      { id: "photo-1562408590-e32931084e23", by: "Umberto" },
      { id: "photo-1587845323226-bad89242c735", by: "Laura Ockel" },
    ],
  },
  {
    words: /\b(tariff|trade war|trade deal|imports?|exports?|shipping|supply chain|port)/i,
    photos: [
      { id: "photo-1590497008432-598f04441de8", by: "Timelab" },
      { id: "photo-1605732562742-3023a888e56e", by: "Aron Yigin" },
    ],
  },
  {
    words: /\b(congress|senate|house\b|capitol|lawmaker|white house|trump|biden|tax|budget|shutdown|debt ceiling|policy|treasury)/i,
    photos: [
      { id: "photo-1520525003249-2b9cdda513bc", by: "Louis Velazquez" },
      { id: "photo-1594581979864-36977b15d0dc", by: "Andy Feliciotti" },
    ],
  },
  {
    words: /\b(jobs?|payroll|unemployment|labor|labour|hiring|layoffs?|wages?|workers?)/i,
    photos: [
      { id: "photo-1635350736475-c8cef4b21906", by: "Eric Prouzet" },
      { id: "photo-1521791136064-7986c2920216", by: "Cytonn Photography" },
    ],
  },
  {
    words: /\b(inflation|cpi|prices|consumer|retail|spending|shoppers?|grocer|walmart|target)/i,
    photos: [
      { id: "photo-1604719312566-8912e9227c6a", by: "Franki Chamaki" },
      { id: "photo-1601598851547-4302969d0614", by: "Eduardo Soares" },
    ],
  },
  {
    words: /\b(bank|wall street|nyse|ipo|jpmorgan|goldman|morgan stanley)/i,
    photos: [
      { id: "photo-1534469650761-fce6cc26ac0d", by: "Aditya Vyas" },
      { id: "photo-1778406466505-6129d0555557", by: "Viktorija Demjanenko" },
    ],
  },
];

/** For a headline that names none of the topics: markets and money. */
const GENERAL: Photo[] = [
  { id: "photo-1611974789855-9c2a0a7236a3", by: "Maxim Hopman" },
  { id: "photo-1767424412548-1a1ac7f4b9bc", by: "Jakub Żerdzicki" },
  { id: "photo-1439434768192-c60615c1b3c8", by: "Hans Eiskonen" },
  { id: "photo-1526304640581-d334cdbbf45e", by: "Alexander Grey" },
  { id: "photo-1579758270512-789b1b701bf0", by: "Joshua Hoehne" },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The photo's address on Unsplash's CDN, cropped to the cards' 16:9. */
function photoUrl(photo: Photo): string {
  return `https://images.unsplash.com/${photo.id}?w=800&h=450&fit=crop&q=70&auto=format`;
}

/**
 * A picture for each headline in a list. The same headline always gets the
 * same photo, and a list does not show the same photo twice while its topic
 * (or the general set) still has another one.
 */
export function pictureHeadlines<T extends { title: string; image: string | null }>(items: T[]): void {
  const used = new Set<string>();
  for (const item of items) {
    const pool = TOPICS.find((t) => t.words.test(item.title))?.photos ?? GENERAL;
    const start = hash(item.title) % pool.length;
    const fresh = [...pool.slice(start), ...pool.slice(0, start)].find((p) => !used.has(p.id));
    const fromGeneral = fresh ?? GENERAL.find((p) => !used.has(p.id));
    const photo = fromGeneral ?? pool[start];
    used.add(photo.id);
    item.image = photoUrl(photo);
  }
}
