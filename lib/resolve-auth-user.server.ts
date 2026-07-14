import "server-only";

import {
  findAuthUserByStaffIdDb,
  findAuthUserByUserIdDb,
} from "@/lib/clinic-db.server";
import { getAllAuthAccounts } from "@/lib/auth-accounts-server";
import { isDatabaseEnabled } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth-session";
import type { ClinicUser, UserRole } from "@/lib/types";

export interface ResolvedAuthUser {
  user: ClinicUser;
  /** true — учётка найдена в DB/файле, false — сессия устарела/уволен */
  found: boolean;
  /** Актуальная версия серверной сессии (только DB-режим). */
  sessionVersion?: number;
  /** Поля, отличающиеся от JWT — нужно обновить cookie */
  sessionPatch?: {
    role?: UserRole;
    name?: string;
    email?: string;
  };
}

function accountToUser(
  session: SessionPayload,
  account: { id: string; login: string; role: UserRole; name: string; staffId?: string }
): ClinicUser {
  return {
    id: account.id,
    name: account.name,
    email: account.login,
    role: account.role,
    staffId: account.staffId ?? session.staffId,
    status: "active",
  };
}

function sessionPatchIfNeeded(
  session: SessionPayload,
  account: { login: string; role: UserRole; name: string }
): ResolvedAuthUser["sessionPatch"] | undefined {
  const patch: NonNullable<ResolvedAuthUser["sessionPatch"]> = {};
  if (account.role !== session.role) patch.role = account.role;
  if (account.name !== session.name) patch.name = account.name;
  if (account.login !== session.email) patch.email = account.login;
  return Object.keys(patch).length > 0 ? patch : undefined;
}

/** Актуальные данные пользователя из БД / файла учёток (роль, имя, email). */
export async function resolveAuthUserFromSession(
  session: SessionPayload
): Promise<ResolvedAuthUser> {
  const fallbackUser: ClinicUser = {
    id: session.userId,
    name: session.name,
    email: session.email,
    role: session.role,
    staffId: session.staffId,
    status: "active",
  };

  if (isDatabaseEnabled() && session.clinicId) {
    const account =
      (session.staffId
        ? await findAuthUserByStaffIdDb(session.clinicId, session.staffId)
        : null) ??
      (await findAuthUserByUserIdDb(session.clinicId, session.userId));

    if (account) {
      const user = accountToUser(session, account);
      return {
        user,
        found: true,
        sessionVersion: account.sessionVersion ?? 0,
        sessionPatch: sessionPatchIfNeeded(session, account),
      };
    }
    return { user: fallbackUser, found: false };
  }

  const fileAccount = getAllAuthAccounts().find(
    (a) =>
      a.id === session.userId ||
      (session.staffId && a.staffId === session.staffId)
  );
  if (fileAccount) {
    const user = accountToUser(session, fileAccount);
    return {
      user,
      found: true,
      sessionPatch: sessionPatchIfNeeded(session, fileAccount),
    };
  }

  return { user: fallbackUser, found: false };
}
