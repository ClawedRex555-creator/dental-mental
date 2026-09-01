import { NextResponse } from "next/server";
import { createMobileStaffWorkAct } from "@/lib/mobile-staff-clinic.server";
import {
  isStaffContext,
  resolveStaffMobileRequest,
  staffErrorResponse,
} from "@/lib/mobile-staff-route.server";

export async function POST(request: Request) {
  const ctx = await resolveStaffMobileRequest(request);
  const err = staffErrorResponse(ctx);
  if (err) return err;
  if (!isStaffContext(ctx)) {
    return NextResponse.json({ error: "Ошибка авторизации" }, { status: 401 });
  }

  let body: {
    appointmentId?: string;
    items?: Array<{
      serviceId?: string;
      serviceName?: string;
      price?: number;
      quantity?: number;
    }>;
    notes?: string;
    submittedToAdmin?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }

  const appointmentId = body.appointmentId?.trim();
  if (!appointmentId) {
    return NextResponse.json({ error: "Укажите appointmentId" }, { status: 400 });
  }

  const items = (body.items ?? [])
    .filter(
      (line) =>
        typeof line.serviceName === "string" &&
        line.serviceName.trim().length > 0 &&
        typeof line.price === "number" &&
        line.price >= 0
    )
    .map((line) => ({
      serviceId: line.serviceId,
      serviceName: line.serviceName!.trim(),
      price: line.price!,
      quantity: line.quantity,
    }));

  if (items.length === 0) {
    return NextResponse.json({ error: "Добавьте услуги в акт" }, { status: 400 });
  }

  try {
    const result = await createMobileStaffWorkAct(
      ctx.clinic.clinicId,
      ctx.session,
      {
        appointmentId,
        items,
        notes: body.notes,
        submittedToAdmin: body.submittedToAdmin,
      }
    );
    return NextResponse.json({ ok: true, workAct: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось создать акт";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
