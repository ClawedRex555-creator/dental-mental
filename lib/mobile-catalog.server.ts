import "server-only";

import type { Doctor, Service } from "@/lib/types";
import { loadClinicSnapshot } from "@/lib/mobile-clinic-context.server";

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

export interface MobileCatalogResponse {
  doctors: MobileCatalogDoctor[];
  services: MobileCatalogService[];
}

function mapDoctor(d: Doctor): MobileCatalogDoctor {
  return {
    id: d.id,
    name: d.name,
    specialization: d.specialization,
    photoUrl: d.avatar,
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

export async function getMobileCatalog(clinicId: string): Promise<MobileCatalogResponse> {
  const record = await loadClinicSnapshot(clinicId);
  const data = record?.data;
  if (!data) {
    return { doctors: [], services: [] };
  }

  const doctors = data.doctors
    .filter((d) => d.status === "active")
    .map(mapDoctor);

  const services = data.services
    .filter((s) => s.active !== false)
    .map(mapService);

  return { doctors, services };
}
