import "../loadEnv.js";
import { load as loadYaml } from "js-yaml";
import { sql, ensureSchema } from "../db/index.js";
import { MEMBERS_REFERENCE } from "../config.js";
import { normalizeLastName, senateMemberKey } from "./normalizeLastName.js";

interface LegislatorTerm {
  type: "rep" | "sen";
  state: string;
  district?: number;
  party?: string;
  start?: string;
  end?: string;
}

interface Legislator {
  id: { bioguide: string };
  name: { official_full?: string; first: string; last: string; nickname?: string };
  terms: LegislatorTerm[];
}

function houseKey(state: string, district: number | undefined): string {
  return `${state}${String(district ?? 0).padStart(2, "0")}`;
}

// A candidate "matches" a trade's member_name if their last name appears in
// it (required) — and, if that alone leaves more than one candidate for the
// same key (e.g. several historical senators surnamed the same thing), it's
// narrowed further by requiring their first name or nickname to appear too
// (nickname covers cases like "JD Vance" vs. legal first name "James David").
// Falls back to "no confident match" (empty) rather than guess among ties.
function matchByName(candidates: Legislator[], memberName: string): Legislator[] {
  const normalizedName = normalizeLastName(memberName);
  const byLastName = candidates.filter((c) => {
    const lastName = normalizeLastName(c.name.last);
    return lastName.length >= 3 && normalizedName.includes(lastName);
  });
  if (byLastName.length <= 1) return byLastName;

  const refined = byLastName.filter((c) => {
    const first = normalizeLastName(c.name.first ?? "");
    const nickname = normalizeLastName(c.name.nickname ?? "");
    return (first.length >= 2 && normalizedName.includes(first)) || (nickname.length >= 2 && normalizedName.includes(nickname));
  });
  return refined.length === 1 ? refined : [];
}

async function fetchLegislators(url: string): Promise<Legislator[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch legislators data: ${res.status}`);
  return loadYaml(await res.text()) as Legislator[];
}

// Bioguide (see MEMBERS_REFERENCE.photoUrl) is Congress's own directory and
// covers ~99% of current members, but a very recently seated member can
// have no photo on file there yet — this fills that gap with a stand-in
// until bioguide catches up. Checked against the real bioguide URL on every
// sync (see resolvePhotoUrl) and dropped automatically the moment that
// starts resolving, so an entry never needs to be manually removed once
// bioguide adds the photo — safe to leave stale, though fine to delete too.
const INTERIM_PHOTO_OVERRIDES: Record<string, string> = {
  // Alan Armstrong (R-OK), appointed to the Senate in March 2026 to fill
  // Markwayne Mullin's seat — bioguide had no photo for him as of Sep 2026.
  // Official Senate portrait, public domain, via Wikimedia Commons.
  A000383: "https://upload.wikimedia.org/wikipedia/commons/5/55/Alan_S_Armstrong_official_portrait_%28cropped_2%29.jpg",
};

async function resolvePhotoUrl(bioguideId: string): Promise<string> {
  const official = MEMBERS_REFERENCE.photoUrl(bioguideId);
  const override = INTERIM_PHOTO_OVERRIDES[bioguideId.toUpperCase()];
  if (!override) return official;
  try {
    const res = await fetch(official, { method: "HEAD" });
    return res.ok ? official : override;
  } catch {
    return override;
  }
}

async function syncCurrentMembers(legislators: Legislator[]): Promise<void> {
  const upsert = sql.query.bind(sql);
  let houseCount = 0;
  let senateCount = 0;

  for (const legislator of legislators) {
    const currentTerm = legislator.terms.at(-1);
    if (!currentTerm) continue; // no longer serving

    const bioguideId = legislator.id.bioguide;
    const officialName = legislator.name.official_full ?? `${legislator.name.first} ${legislator.name.last}`;

    let key: string;
    if (currentTerm.type === "rep") {
      key = houseKey(currentTerm.state, currentTerm.district);
      houseCount++;
    } else if (currentTerm.type === "sen") {
      // Senate filings carry no district/state field the way House ones do,
      // so senators are matched by last name instead — see normalizeLastName.ts.
      key = senateMemberKey(legislator.name.last);
      senateCount++;
    } else {
      continue;
    }

    await upsert(
      `INSERT INTO members_reference (state_district, bioguide_id, official_name, party, photo_url, state, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (state_district) DO UPDATE SET
         bioguide_id = EXCLUDED.bioguide_id,
         official_name = EXCLUDED.official_name,
         party = EXCLUDED.party,
         photo_url = EXCLUDED.photo_url,
         state = EXCLUDED.state,
         updated_at = NOW()`,
      [key, bioguideId, officialName, currentTerm.party ?? null, await resolvePhotoUrl(bioguideId), currentTerm.state]
    );
  }

  console.log(`Synced ${houseCount} current House members (by state+district) and ${senateCount} current Senators (by last name).`);
}

function indexByKey(legislators: Legislator[]): { houseIndex: Map<string, Legislator[]>; senateIndex: Map<string, Legislator[]> } {
  // Index every legislator under every key they ever held (not just their
  // latest term) — someone can carry different House district numbers
  // across their career as their state gets redistricted.
  const houseIndex = new Map<string, Legislator[]>();
  const senateIndex = new Map<string, Legislator[]>();
  for (const legislator of legislators) {
    const seenKeys = new Set<string>();
    for (const term of legislator.terms) {
      const key = term.type === "rep" ? houseKey(term.state, term.district) : term.type === "sen" ? senateMemberKey(legislator.name.last) : null;
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);
      const index = term.type === "rep" ? houseIndex : senateIndex;
      const bucket = index.get(key);
      if (bucket) bucket.push(legislator);
      else index.set(key, [legislator]);
    }
  }
  return { houseIndex, senateIndex };
}

async function upsertMemberReference(key: string, legislator: Legislator, term: LegislatorTerm | undefined): Promise<void> {
  const bioguideId = legislator.id.bioguide;
  const officialName = legislator.name.official_full ?? `${legislator.name.first} ${legislator.name.last}`;
  await sql.query(
    `INSERT INTO members_reference (state_district, bioguide_id, official_name, party, photo_url, state, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (state_district) DO NOTHING`,
    [key, bioguideId, officialName, term?.party ?? null, await resolvePhotoUrl(bioguideId), term?.state ?? null]
  );
}

// A trade filed while someone was still in office keeps referencing their
// state_district/name key forever — but that key can go stale in two ways:
// they leave office entirely (retire, resign, lose re-election, move to
// another office), or — House members only — their district gets
// renumbered by redistricting, so *they're* still current but their *old*
// key isn't. Either way syncCurrentMembers above no longer has a row for
// that key and the trade shows no photo. This fills those gaps: first by
// checking whether the old key's occupant is a still-current member under a
// new key (same state, matched by name), then by checking
// legislators-historical.yaml for whoever held that exact key. A candidate
// only counts if matchByName resolves it to exactly one person — an
// ambiguous or missing match is left alone (falls back to the initials
// avatar) rather than risk attaching the wrong person's photo, since
// state_district keys get reused by different people across different
// Congresses.
async function backfillFormerMembers(currentLegislators: Legislator[], historicalLegislators: Legislator[]): Promise<void> {
  const missing = await sql`
    SELECT DISTINCT t.member_name, t.state_district
    FROM transactions t
    LEFT JOIN members_reference mr ON mr.state_district = t.state_district
    WHERE t.state_district IS NOT NULL AND mr.state_district IS NULL
  `;

  if (missing.length === 0) {
    console.log("No former/unmatched members to backfill — every traded state_district already has a photo.");
    return;
  }

  console.log(`${missing.length} traded state_district key(s) have no current member match — resolving...`);

  // Redistricting fallback: a still-current House member whose district was
  // renumbered. Grouped by state (the first two characters of a house key)
  // since that's the one thing guaranteed not to change.
  const currentByState = new Map<string, Legislator[]>();
  for (const legislator of currentLegislators) {
    const currentTerm = legislator.terms.at(-1);
    if (currentTerm?.type !== "rep") continue;
    const bucket = currentByState.get(currentTerm.state);
    if (bucket) bucket.push(legislator);
    else currentByState.set(currentTerm.state, [legislator]);
  }

  const { houseIndex, senateIndex } = indexByKey(historicalLegislators);

  let resolved = 0;
  let skipped = 0;

  for (const row of missing as { member_name: string; state_district: string }[]) {
    const key = row.state_district;
    const isSenate = key.startsWith("SEN:");

    if (!isSenate) {
      const state = key.slice(0, 2);
      const redistricted = matchByName(currentByState.get(state) ?? [], row.member_name);
      if (redistricted.length === 1) {
        const legislator = redistricted[0];
        await upsertMemberReference(key, legislator, legislator.terms.at(-1));
        resolved++;
        continue;
      }
    }

    const candidates = (isSenate ? senateIndex.get(key) : houseIndex.get(key)) ?? [];
    const matches = matchByName(candidates, row.member_name);
    if (matches.length !== 1) {
      skipped++;
      continue;
    }

    const legislator = matches[0];
    // Use the specific term that produced this key (party/state can change
    // across a career) — the most recent one if they held it more than once.
    const matchingTerm = [...legislator.terms].reverse().find((term) =>
      term.type === "rep" ? houseKey(term.state, term.district) === key : term.type === "sen" ? senateMemberKey(legislator.name.last) === key : false
    );
    await upsertMemberReference(key, legislator, matchingTerm);
    resolved++;
  }

  console.log(`Backfilled ${resolved} former/renumbered member(s); ${skipped} left unmatched (no confident single match).`);
}

// Only terms that could plausibly overlap a filing in this database are
// worth storing — legislators-historical.yaml goes back to 1789, and the
// vast majority of it (everyone whose last term ended well before our
// earliest filing) would just be dead weight in member_terms. 2015 gives a
// comfortable margin before this app's actual filing range.
const EARLIEST_RELEVANT_TERM_END = "2015-01-01";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// One row per person (by bioguide_id) in members_history, and one row per
// term of theirs (recent enough to matter — see EARLIEST_RELEVANT_TERM_END)
// in member_terms. Building both from the *same* combined current+historical
// legislator list keeps a person who appears in both files (elected again
// after a gap, e.g.) to a single members_history row — last-write-wins on
// whichever list entry is processed later, which is fine since a person's
// bioguide-derived photo/name don't depend on which file supplied them.
async function syncMembersHistoryAndTerms(allLegislators: Legislator[]): Promise<void> {
  const historyRows: { bioguideId: string; officialName: string; party: string | null; photoUrl: string; state: string | null }[] = [];
  const termRows: { stateDistrict: string; bioguideId: string; start: string; end: string | null }[] = [];

  for (const legislator of allLegislators) {
    const bioguideId = legislator.id.bioguide;
    const relevantTerms = legislator.terms.filter((t) => t.start && (!t.end || t.end >= EARLIEST_RELEVANT_TERM_END));
    if (relevantTerms.length === 0) continue;

    const latestTerm = relevantTerms.at(-1)!;
    const officialName = legislator.name.official_full ?? `${legislator.name.first} ${legislator.name.last}`;
    historyRows.push({
      bioguideId,
      officialName,
      party: latestTerm.party ?? null,
      photoUrl: await resolvePhotoUrl(bioguideId),
      state: latestTerm.state ?? null,
    });

    const seenKeys = new Set<string>();
    for (const term of relevantTerms) {
      const key = term.type === "rep" ? houseKey(term.state, term.district) : term.type === "sen" ? senateMemberKey(legislator.name.last) : null;
      // A person can hold the same key across non-contiguous terms (elected,
      // lost re-election, elected again later) — de-duped per (key, start)
      // by the UNIQUE constraint itself, not needed here; seenKeys instead
      // guards the much more common case of a >2-year single continuous
      // term appearing to repeat because YAML lists Congresses separately.
      const dedupeKey = `${key}|${term.start}`;
      if (!key || seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);
      termRows.push({ stateDistrict: key, bioguideId, start: term.start!, end: term.end ?? null });
    }
  }

  for (const batch of chunk(historyRows, 200)) {
    const values: string[] = [];
    const params: unknown[] = [];
    for (const row of batch) {
      const base = params.length;
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, NOW())`);
      params.push(row.bioguideId, row.officialName, row.party, row.photoUrl, row.state);
    }
    await sql.query(
      `INSERT INTO members_history (bioguide_id, official_name, party, photo_url, state, updated_at)
       VALUES ${values.join(", ")}
       ON CONFLICT (bioguide_id) DO UPDATE SET
         official_name = EXCLUDED.official_name,
         party = EXCLUDED.party,
         photo_url = EXCLUDED.photo_url,
         state = EXCLUDED.state,
         updated_at = NOW()`,
      params
    );
  }

  for (const batch of chunk(termRows, 200)) {
    const values: string[] = [];
    const params: unknown[] = [];
    for (const row of batch) {
      const base = params.length;
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
      params.push(row.stateDistrict, row.bioguideId, row.start, row.end);
    }
    await sql.query(
      `INSERT INTO member_terms (state_district, bioguide_id, term_start, term_end)
       VALUES ${values.join(", ")}
       ON CONFLICT (state_district, bioguide_id, term_start) DO UPDATE SET term_end = EXCLUDED.term_end`,
      params
    );
  }

  console.log(`Synced ${historyRows.length} people into members_history and ${termRows.length} terms into member_terms.`);
}

// A filing's state_district key alone can't say *which* of possibly several
// people who've held that seat actually filed it (see members_history's own
// comment for the Upton/Dingell, Sessions/Johnson examples this was written
// to fix) — this resolves the specific person for every filing, by name
// first and district+date only as a tie-breaker.
//
// Name first, not district+date first, because the House Clerk's own
// state_district field is occasionally stale: confirmed on a real filing,
// Pete Sessions doc 20020443 (Feb 2022, tagged TX32 — the district he lost
// re-election in back in 2018, not TX17 where he'd already been serving for
// over a year by then). An earlier version of this function matched
// district+date alone and got it wrong in exactly the way this whole fix
// was meant to prevent: it found the term that legitimately covers "TX32 in
// Feb 2022" and silently attached that (unrelated) person's party to
// Sessions' own filing. member_name is far more reliable than
// state_district turned out to be, so it's trusted first; district+date
// only steps in to break a genuine same-name tie.
//
// Reprocesses every filing (not just unresolved ones) each run — cheap
// (comparing a few thousand filings against ~1000 candidates is trivial),
// and it's what lets a bad resolution from an earlier, less careful version
// of this logic self-correct instead of staying wrong forever.
async function resolveFilingBioguideIds(allLegislators: Legislator[]): Promise<void> {
  const recentLegislators = allLegislators.filter((l) => l.terms.some((t) => t.start && (!t.end || t.end >= EARLIEST_RELEVANT_TERM_END)));

  const filings = await sql.query(
    `SELECT doc_id, member_name, state_district, filing_date, bioguide_id FROM filings WHERE member_name IS NOT NULL AND member_name != ''`
  );

  let changed = 0;
  for (const row of filings as { doc_id: string; member_name: string; state_district: string | null; filing_date: string | null; bioguide_id: string | null }[]) {
    const nameMatches = matchByName(recentLegislators, row.member_name);

    let resolvedId: string | null = null;
    if (nameMatches.length === 1) {
      resolvedId = nameMatches[0].id.bioguide;
    } else if (nameMatches.length > 1 && row.state_district && row.filing_date) {
      // Genuine same-name ambiguity — narrow by whoever actually held this
      // exact key on this exact date.
      const districtMatches = nameMatches.filter((c) =>
        c.terms.some(
          (t) =>
            t.start &&
            row.filing_date! >= t.start &&
            (!t.end || row.filing_date! <= t.end) &&
            (t.type === "rep" ? houseKey(t.state, t.district) === row.state_district : t.type === "sen" ? senateMemberKey(c.name.last) === row.state_district : false)
        )
      );
      if (districtMatches.length === 1) resolvedId = districtMatches[0].id.bioguide;
    }

    if (resolvedId && resolvedId !== row.bioguide_id) {
      await sql.query(`UPDATE filings SET bioguide_id = $1 WHERE doc_id = $2`, [resolvedId, row.doc_id]);
      changed++;
    }
  }
  console.log(`Resolved/corrected bioguide_id for ${changed} filing(s) (name match, district+date as tie-break only).`);
}

async function main() {
  await ensureSchema();

  console.log("Fetching current members of Congress...");
  const currentLegislators = await fetchLegislators(MEMBERS_REFERENCE.legislatorsYamlUrl);
  console.log("Fetching historical members of Congress...");
  const historicalLegislators = await fetchLegislators(MEMBERS_REFERENCE.legislatorsHistoricalYamlUrl);
  const allLegislators = [...currentLegislators, ...historicalLegislators];

  await syncCurrentMembers(currentLegislators);
  await backfillFormerMembers(currentLegislators, historicalLegislators);
  await syncMembersHistoryAndTerms(allLegislators);
  await resolveFilingBioguideIds(allLegislators);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
