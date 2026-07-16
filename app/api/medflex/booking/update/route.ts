import { NextResponse } from "next/server";
import { requireMedflexInboundAuth } from "@/lib/medflex/inbound-auth.server";
import { updateMedflexBooking } from "@/lib/medflex/booking.server";
import type { MedflexBookingRequest } from "@/lib/medflex/types";

export async function POST(request: Request) {
  const auth = await requireMedflexInboundAuth(request);
  if (auth instanceof Response) return auth;

  let body: MedflexBookingRequest & { claim_id?: string };
  try {
    body = (await request.json()) as MedflexBookingRequest & { claim_id?: string };
  } catch {
    return NextResponse.json({ status_code: 400, detail: "Неверный JSON" }, { status: 200 });
  }
  if (!body.claim_id?.trim()) {
    return NextResponse.json({ status_code: 400, detail: "Не указан claim_id" }, { status: 200 });
  }

  const result = await updateMedflexBooking(auth.clinicId, {
    ...body,
    claim_id: body.claim_id.trim(),
  });
  return NextResponse.json(result, { status: 200 });
}
