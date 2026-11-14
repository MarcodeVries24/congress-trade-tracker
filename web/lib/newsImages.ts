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
      { id: "photo-1570129477492-45c003edd2be", by: "todd kent" },
      { id: "photo-1568605114967-8130f3a36994", by: "vu anh" },
    ],
  },
  {
    words: /\b(fed|federal reserve|powell|rate cut|rate hike|rates?\b|central bank|fomc|monetary)/i,
    photos: [
      { id: "photo-1542320728179-bda01e6f5c73", by: "Alex Bierwagen" },
      { id: "photo-1783571856194-004fac25c615", by: "Yang-Chen Lin" },
      { id: "photo-1633059050703-0f1b50828402", by: "Joshua Woroniecki" },
      { id: "photo-1689732888407-310424e3a372", by: "Austin Hervias" },
      { id: "photo-1560221328-12fe60f83ab8", by: "Nicholas Cappello" },
    ],
  },
  {
    words: /\b(crypto|bitcoin|ether|stablecoin|blockchain|coinbase)/i,
    photos: [
      { id: "photo-1518546305927-5a555bb7020d", by: "André François McKenzie" },
      { id: "photo-1640161704729-cbe966a08476", by: "Traxer" },
      { id: "photo-1623227413711-25ee4388dae3", by: "Kanchanara" },
      { id: "photo-1628151015968-3a4429e9ef04", by: "Kanchanara" },
      { id: "photo-1590283603385-17ffb3a7f29f", by: "Nick Chong" },
    ],
  },
  {
    words: /\b(oil|crude|opec|gasoline|gas prices|energy|natural gas|refin|drill)/i,
    photos: [
      { id: "photo-1516199423456-1f1e91b06f25", by: "Zbynek Burival" },
      { id: "photo-1777195148867-68a6f0e9aa8f", by: "Alpha Perspective" },
      { id: "photo-1786532852011-443cba5dc9fe", by: "Red Shuheart" },
      { id: "photo-1762381157166-f51ac99ab412", by: "Bernd Dittrich" },
      { id: "photo-1638068109209-002be3ae4950", by: "Josh McCausland" },
    ],
  },
  {
    words: /\b(chip|semiconductor|nvidia|ai\b|artificial intelligence|tech|software|apple|microsoft|google|alphabet|meta|amazon)/i,
    photos: [
      { id: "photo-1562408590-e32931084e23", by: "Umberto" },
      { id: "photo-1587845323226-bad89242c735", by: "Laura Ockel" },
      { id: "photo-1584169417032-d34e8d805e8b", by: "İsmail Enes Ayhan" },
      { id: "photo-1762163516269-3c143e04175c", by: "Domaintechnik" },
      { id: "photo-1784652852605-6945598f2af3", by: "Tony Marinescu" },
      { id: "photo-1494083306499-e22e4a457632", by: "Brian Kostiuk" },
    ],
  },
  {
    words: /\b(tariff|trade war|trade deal|imports?|exports?|shipping|supply chain|port)/i,
    photos: [
      { id: "photo-1590497008432-598f04441de8", by: "Timelab" },
      { id: "photo-1605732562742-3023a888e56e", by: "Aron Yigin" },
      { id: "photo-1606185540834-d6e7483ee1a4", by: "william william" },
      { id: "photo-1780940359464-3469e931dfe5", by: "Anthony Maw" },
      { id: "photo-1769144256207-bc4bb75b29db", by: "Daniel Miksha" },
    ],
  },
  {
    words: /\b(congress|senate|house\b|capitol|lawmaker|white house|trump|biden|tax|budget|shutdown|debt ceiling|policy|treasury)/i,
    photos: [
      { id: "photo-1520525003249-2b9cdda513bc", by: "Louis Velazquez" },
      { id: "photo-1594581979864-36977b15d0dc", by: "Andy Feliciotti" },
      { id: "photo-1775521037295-86f750e113dd", by: "Sebastian Schuster" },
      { id: "photo-1763434679100-e6dd7858e2f0", by: "Damian Kravchuk" },
      { id: "photo-1557160854-e1e89fdd3286", by: "Caleb Perez" },
    ],
  },
  {
    words: /\b(jobs?|payroll|unemployment|labor|labour|hiring|layoffs?|wages?|workers?)/i,
    photos: [
      { id: "photo-1635350736475-c8cef4b21906", by: "Eric Prouzet" },
      { id: "photo-1521791136064-7986c2920216", by: "Cytonn Photography" },
      { id: "photo-1587582423116-ec07293f0395", by: "Josh Olalde" },
      { id: "photo-1541888946425-d81bb19240f5", by: "Scott Blake" },
      { id: "photo-1504307651254-35680f356dfd", by: "Etienne Girardet" },
    ],
  },
  {
    words: /\b(inflation|cpi|prices|consumer|retail|spending|shoppers?|grocer|walmart|target)/i,
    photos: [
      { id: "photo-1604719312566-8912e9227c6a", by: "Franki Chamaki" },
      { id: "photo-1601598851547-4302969d0614", by: "Eduardo Soares" },
      { id: "photo-1483985988355-763728e1935b", by: "freestocks" },
      { id: "photo-1772760224872-db7c8f49404a", by: "Andy Wang" },
      { id: "photo-1578916171728-46686eac8d58", by: "Nathália Rosa" },
    ],
  },
  {
    words: /\b(bank|wall street|nyse|ipo|jpmorgan|goldman|morgan stanley)/i,
    photos: [
      { id: "photo-1534469650761-fce6cc26ac0d", by: "Aditya Vyas" },
      { id: "photo-1778406466505-6129d0555557", by: "Viktorija Demjanenko" },
      { id: "photo-1761233138981-50a88922c852", by: "Maxim Klimashin" },
      { id: "photo-1631216166880-9e9b51577962", by: "Tomas Eidsvold" },
      { id: "photo-1783691501246-9f6575f2c786", by: "Cara Willenbrock" },
    ],
  },
];

/** For a headline that names none of the topics: markets and money. */
const GENERAL: Photo[] = [
  { id: "photo-1611974789855-9c2a0a7236a3", by: "Maxim Hopman" },
  { id: "photo-1767424412548-1a1ac7f4b9bc", by: "Jakub Żerdzicki" },
  { id: "photo-1439434768192-c60615c1b3c8", by: "Hans Eiskonen" },
  { id: "photo-1511883040705-6011fad9edfc", by: "Jeffrey Blum" },
  { id: "photo-1449157291145-7efd050a4d0e", by: "Matthew Henry" },
  { id: "photo-1745270917331-787c80129680", by: "Arturo Añez" },
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
