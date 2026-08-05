import "server-only";

import type { Doctor, Service } from "@/lib/types";
import { loadClinicSnapshot } from "@/lib/mobile-clinic-context.server";
import { sanitizeHttpImageUrl } from "@/lib/safe-url";

export interface MobileCatalogDoctor {
  id: string;
  name: string;
  specialization?: string;
  photoUrl?: string;
}

export interface MobileCatalogService {
  id: string;
  name: string;
  category?: string;
  price: number;
  durationMinutes?: number;
}

export interface MobileCatalogClinicInfo {
  slug: string;
  name: string;
  phone?: string;
  address?: string;
  description?: string;
  workHours?: string;
  logoUrl?: string;
}

export interface MobileCatalogResponse {
  doctors: MobileCatalogDoctor[];
  services: MobileCatalogService[];
  clinicInfo?: MobileCatalogClinicInfo;
}

function mapDoctor(d: Doctor): MobileCatalogDoctor {
  return {
    id: d.id,
    name: d.name,
    specialization: d.specialization,
    photoUrl: sanitizeHttpImageUrl(d.avatar) || undefined,
  };
}

function mapService(s: Service): MobileCatalogService {
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    price: s.price ?? 0,
    durationMinutes: s.duration,
  };
}

export async function getMobileCatalog(
  clinicId: string,
  clinicMeta?: { slug: string; name: string }
): Promise<MobileCatalogResponse> {
  const record = await loadClinicSnapshot(clinicId);
  const data = record?.data;
  if (!data) {
    return { doctors: [], services: [] };
  }

  const settings = data.clinicSettings;
  const clinicInfo: MobileCatalogClinicInfo | undefined =
    clinicMeta || settings
      ? {
          slug: clinicMeta?.slug ?? "",
          name: settings?.name ?? clinicMeta?.name ?? "",
          phone: settings?.phone || undefined,
          address: settings?.address || undefined,
          description: settings?.workHours || undefined,
          workHours: settings?.workHours || undefined,
          logoUrl: sanitizeHttpImageUrl(settings?.logo) || undefined,
        }
      : undefined;

  const doctors = data.doctors
    .filter((d) => d.status === "active")
    .map(mapDoctor);

  const services = data.services
    .filter((s) => s.active !== false)
    .map(mapService);

  return { doctors, services, clinicInfo };
}
