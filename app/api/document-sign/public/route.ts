import { NextResponse } from "next/server";
import { getDocumentSignPublicView } from "@/lib/document-sign/confirm.server";
import { isDatabaseEnabled } from "@/lib/db";

/** Публичный просмотр пакета документов по подписанной ссылке */
export async function GET(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 });
  }

  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Неверная ссылка" }, { status: 400 });
  }

  const result = await getDocumentSignPublicView(token);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.view);
}
