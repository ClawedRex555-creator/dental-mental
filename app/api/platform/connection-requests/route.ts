import { NextResponse } from "next/server";
import { verifySameOrigin } from "@/lib/csrf-origin";
import { requireSuperAdminSession } from "@/lib/get-server-session";
import {
  listConnectionRequests,
  provisionClinicFromRequest,
  updateConnectionRequestStatus,
  type ConnectionRequestStatus,
} from "@/lib/platform-connection-requests.server";

const ALLOWED_STATUSES: ConnectionRequestStatus[] = [
  "new",
  "contacted",
  "approved",
  "rejected",
];

export async function GET() {
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }
  try {
    const requests = await listConnectionRequests();
    return NextResponse.json({ requests });
  } catch (error) {
    console.error("[platform/connection-requests GET]", error);
    return NextResponse.json({ error: "Не удалось загрузить заявки" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  let body: { id?: string; status?: ConnectionRequestStatus; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }
  if (!body.id || !body.status || !ALLOWED_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Укажите id и корректный статус" }, { status: 400 });
  }

  try {
    const ok = await updateConnectionRequestStatus({
      id: body.id,
      status: body.status,
      handledBy: session.userId,
      notes: body.notes,
    });
    if (!ok) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[platform/connection-requests PATCH]", error);
    return NextResponse.json({ error: "Не удалось обновить заявку" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }
  const session = await requireSuperAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  let body: { requestId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }
  if (!body.requestId) {
    return NextResponse.json({ error: "Укажите requestId" }, { status: 400 });
  }

  try {
    const result = await provisionClinicFromRequest({
      requestId: body.requestId,
      handledBy: session.userId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось создать клинику";
    if (message === "REQUEST_NOT_FOUND") {
      return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
    }
    if (message === "OWNER_EMAIL_TAKEN") {
      return NextResponse.json(
        {
          error:
            "Email из заявки уже используется в системе. Измените контакт в заявке или создайте клинику вручную.",
        },
        { status: 409 }
      );
    }
    if (message === "CLINIC_ALREADY_PROVISIONED") {
      return NextResponse.json(
        { error: "По этой заявке клиника уже создана." },
        { status: 409 }
      );
    }
    console.error("[platform/connection-requests POST]", error);
    return NextResponse.json({ error: "Не удалось создать клинику" }, { status: 500 });
  }
}
