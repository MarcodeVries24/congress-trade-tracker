import "../loadEnv.js";
import { load as loadYaml } from "js-yaml";
import { sql, ensureSchema } from "../db/index.js";
import { MEMBERS_REFERENCE } from "../config.js";
import { senateMemberKey } from "./normalizeLastName.js";

interface LegislatorTerm {
  type: "rep" | "sen";
  state: string;
  district?: number;
  party?: string;
}

interface Legislator {
  id: { bioguide: string };
  name: { official_full?: string; first: string; last: string };
  terms: LegislatorTerm[];
}

async function main() {
  await ensureSchema();

  console.log("Fetching current members of Congress...");
  const res = await fetch(MEMBERS_REFERENCE.legislatorsYamlUrl);
  if (!res.ok) throw new Error(`Failed to fetch legislators data: ${res.status}`);
  const legislators = loadYaml(await res.text()) as Legislator[];

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
      const district = currentTerm.district ?? 0;
      key = `${currentTerm.state}${String(district).padStart(2, "0")}`;
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
      [key, bioguideId, officialName, currentTerm.party ?? null, MEMBERS_REFERENCE.photoUrl(bioguideId), currentTerm.state]
    );
  }

  console.log(`Synced ${houseCount} current House members (by state+district) and ${senateCount} current Senators (by last name).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
