import { NextResponse } from "next/server";
import { getRiverData } from "@/lib/sentiment";

/** Free/ungated, like /api/stats and /api/dashboard — it is the front page. */
export async function GET() {
  return NextResponse.json(await getRiverData());
}
