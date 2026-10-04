import { getRiverData } from "@/lib/sentiment";
import { publicJson } from "@/lib/cache";

/** Free/ungated, like /api/stats and /api/dashboard — it is the front page. */
export async function GET() {
  return publicJson(await getRiverData());
}
