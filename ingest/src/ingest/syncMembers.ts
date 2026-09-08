import "../loadEnv.js";
import { load as loadYaml } from "js-yaml";
import { sql, ensureSchema } from "../db/index.js";
import { MEMBERS_REFERENCE } from "../config.js";

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
  let count = 0;

  for (const legislator of legislators) {
    const currentTerm = legislator.terms.at(-1);
    if (!currentTerm || currentTerm.type !== "rep") continue; // senators / no longer serving

    const district = currentTerm.district ?? 0;
    const stateDistrict = `${currentTerm.state}${String(district).padStart(2, "0")}`;
    const bioguideId = legislator.id.bioguide;
    const officialName = legislator.name.official_full ?? `${legislator.name.first} ${legislator.name.last}`;

    await upsert(
      `INSERT INTO members_reference (state_district, bioguide_id, official_name, party, photo_url, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (state_district) DO UPDATE SET
         bioguide_id = EXCLUDED.bioguide_id,
         official_name = EXCLUDED.official_name,
         party = EXCLUDED.party,
         photo_url = EXCLUDED.photo_url,
         updated_at = NOW()`,
      [stateDistrict, bioguideId, officialName, currentTerm.party ?? null, MEMBERS_REFERENCE.photoUrl(bioguideId)]
    );
    count++;
  }

  console.log(`Synced ${count} current House members (by state+district).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
