import "server-only";

import { getClinicDataDbWithLegacyStaff } from "@/lib/clinic-data-db.server";
import { findClinicBySlug, listClinics } from "@/lib/clinic-db.server";
import { medflexPostJson } from "@/lib/medflex/client.server";
import {
  listMedflexEnabledClinics,
  patchMedflexConfigMeta,
  getMedflexConfig,
} from "@/lib/medflex/db.server";
import {
  buildMedflexDoctorsSchedulePayload,
  buildMedflexServicesSchedulePayload,
} from "@/lib/medflex/schedule.server";

export async function pushMedflexScheduleForClinic(clinicId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const config = await getMedflexConfig(clinicId);
  if (!config.enabled) return { ok: false, error: "MedFlex выключен" };
  if (!config.apiToken?.trim()) return { ok: false, error: "Нет API-токена" };

  const clinics = await listClinics();
  const clinic = clinics.find((c) => c.id === clinicId);
  const snapshot = await getClinicDataDbWithLegacyStaff(clinicId);
  if (!snapshot?.data) return { ok: false, error: "Нет снимка клиники" };

  const payload = buildMedflexDoctorsSchedulePayload(
    snapshot.data,
    config,
    clinic?.name || snapshot.data.clinicSettings.name
  );
  const result = await medflexPostJson(config, "/v2/doctors/send_schedule/", payload);
  const now = new Date().toISOString();
  if (!result.ok) {
    await patchMedflexConfigMeta(clinicId, {
      lastSchedulePushAt: now,
      lastSchedulePushError: `HTTP ${result.status}: ${result.text.slice(0, 300)}`,
    });
    return { ok: false, error: result.text || `HTTP ${result.status}` };
  }
  await patchMedflexConfigMeta(clinicId, {
    lastSchedulePushAt: now,
    lastSchedulePushError: undefined,
  });
  return { ok: true };
}

export async function pushMedflexServicesForClinic(clinicId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const config = await getMedflexConfig(clinicId);
  if (!config.enabled) return { ok: false, error: "MedFlex выключен" };
  if (!config.apiToken?.trim()) return { ok: false, error: "Нет API-токена" };
  if (config.pushServices === false) return { ok: true };

  const clinics = await listClinics();
  const clinic = clinics.find((c) => c.id === clinicId);
  const snapshot = await getClinicDataDbWithLegacyStaff(clinicId);
  if (!snapshot?.data) return { ok: false, error: "Нет снимка клиники" };

  const payload = buildMedflexServicesSchedulePayload(
    snapshot.data,
    config,
    clinic?.name || snapshot.data.clinicSettings.name
  );
  const result = await medflexPostJson(config, "/v2/services/send_schedule/", payload);
  const now = new Date().toISOString();
  if (!result.ok) {
    await patchMedflexConfigMeta(clinicId, {
      lastServicesPushAt: now,
      lastServicesPushError: `HTTP ${result.status}: ${result.text.slice(0, 300)}`,
    });
    return { ok: false, error: result.text || `HTTP ${result.status}` };
  }
  await patchMedflexConfigMeta(clinicId, {
    lastServicesPushAt: now,
    lastServicesPushError: undefined,
  });
  return { ok: true };
}

export async function processMedflexQueue(options?: {
  clinicId?: string;
  limit?: number;
}): Promise<{ processed: number; ok: number; failed: number; errors: string[] }> {
  const enabled = options?.clinicId
    ? [
        {
          id: options.clinicId,
          slug: "",
          name: "",
          config: await getMedflexConfig(options.clinicId),
        },
      ].filter((c) => c.config.enabled)
    : await listMedflexEnabledClinics();

  const limit = options?.limit ?? enabled.length;
  let processed = 0;
  let ok = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const clinic of enabled.slice(0, limit)) {
    processed += 1;
    const schedule = await pushMedflexScheduleForClinic(clinic.id);
    if (!schedule.ok) {
      failed += 1;
      errors.push(`${clinic.slug || clinic.id}: schedule ${schedule.error}`);
    } else {
      ok += 1;
    }
    if (clinic.config.pushServices !== false) {
      const services = await pushMedflexServicesForClinic(clinic.id);
      if (!services.ok) {
        failed += 1;
        errors.push(`${clinic.slug || clinic.id}: services ${services.error}`);
      }
    }
  }

  return { processed, ok, failed, errors };
}

export async function resolveClinicIdBySlugOrId(
  slugOrId: string
): Promise<string | null> {
  const bySlug = await findClinicBySlug(slugOrId);
  if (bySlug) return bySlug.id;
  const clinics = await listClinics();
  return clinics.find((c) => c.id === slugOrId)?.id ?? null;
}
