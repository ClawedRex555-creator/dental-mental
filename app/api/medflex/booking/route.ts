import { NextResponse } from "next/server";
import { requireMedflexInboundAuth } from "@/lib/medflex/inbound-auth.server";
import { createMedflexBooking } from "@/lib/medflex/booking.server";
import type { MedflexBookingRequest } from "@/lib/medflex/types";

export async function POST(request: Request) {
  const auth = await requireMedflexInboundAuth(request);
  if (auth instanceof Response) return auth;

  let body: MedflexBookingRequest;
  try {
    body = (await request.json()) as MedflexBookingRequest;
  } catch {
    return NextResponse.json(
      { status_code: 400, detail: "Неверный JSON" },
      { status: 200 }
    );
  }

  const result = await createMedflexBooking(auth.clinicId, body);
  return NextResponse.json(result, { status: 200 });
}
