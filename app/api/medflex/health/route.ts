import { requireMedflexInboundAuth } from "@/lib/medflex/inbound-auth.server";

/** Health-check MedFlex: GET → HTTP 204 */
export async function GET(request: Request) {
  const auth = await requireMedflexInboundAuth(request);
  if (auth instanceof Response) return auth;
  return new Response(null, { status: 204 });
}
