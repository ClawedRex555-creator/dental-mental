import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export async function GET() {
  try {
    const pool = getPool();
    if (!pool) {
      return NextResponse.json({ ok: true, database: false });
    }
    await pool.query("SELECT 1");
    return NextResponse.json({ ok: true, database: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
