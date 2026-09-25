import { NextResponse } from "next/server";
import { getProvenance } from "@/lib/provenance";

/** Free/ungated — it is the front page's answer to "why believe any of this". */
export async function GET() {
  return NextResponse.json(await getProvenance());
}
