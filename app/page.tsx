import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth-session";
import { defaultPathForRole } from "@/lib/rbac";

export default async function Home() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!session) redirect("/login");
  redirect(defaultPathForRole(session.role));
}
