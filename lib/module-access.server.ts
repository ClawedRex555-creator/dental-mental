import "server-only";

import { NextResponse } from "next/server";
import {
  isModuleEnabled,
  MODULE_LABELS,
  type SystemModuleId,
} from "@/lib/modules";
import { getClinicModules } from "@/lib/platform-modules.server";

export async function clinicHasModule(
  clinicId: string,
  moduleId: SystemModuleId
): Promise<boolean> {
  const modules = await getClinicModules(clinicId);
  return isModuleEnabled(modules, moduleId);
}

export function moduleDisabledResponse(moduleId: SystemModuleId): NextResponse {
  const label = MODULE_LABELS[moduleId] ?? moduleId;
  return NextResponse.json(
    { error: `Раздел «${label}» отключён для этой клиники`, module: moduleId },
    { status: 403 }
  );
}

/** null = доступ разрешён */
export async function assertClinicModule(
  clinicId: string,
  moduleId: SystemModuleId
): Promise<NextResponse | null> {
  if (await clinicHasModule(clinicId, moduleId)) return null;
  return moduleDisabledResponse(moduleId);
}
