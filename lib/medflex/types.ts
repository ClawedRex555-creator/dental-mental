/** Конфиг и DTO интеграции MedFlex / ПроДокторов */

export const MEDFLEX_DEFAULT_API_BASE = "https://mis-api.medflex.ru";
export const MEDFLEX_SCHEDULE_DAYS = 30;

export interface MedflexClinicConfig {
  enabled: boolean;
  /** Токен для исходящих запросов к MedFlex (Authorization: Token …) */
  apiToken?: string;
  apiBaseUrl?: string;
  /** Id филиала в payload (любой стабильный id) */
  filialId?: string;
  filialName?: string;
  /** Токен, который MedFlex шлёт нам на webhook’и */
  inboundToken?: string;
  scheduleDays?: number;
  /** Выгружать услуги отдельным методом */
  pushServices?: boolean;
  lastSchedulePushAt?: string;
  lastSchedulePushError?: string;
  lastServicesPushAt?: string;
  lastServicesPushError?: string;
}

export function defaultMedflexConfig(): MedflexClinicConfig {
  return {
    enabled: false,
    apiBaseUrl: MEDFLEX_DEFAULT_API_BASE,
    scheduleDays: MEDFLEX_SCHEDULE_DAYS,
    pushServices: true,
  };
}

export function parseMedflexConfig(raw: unknown): MedflexClinicConfig {
  const base = defaultMedflexConfig();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    apiToken: typeof o.apiToken === "string" ? o.apiToken : undefined,
    apiBaseUrl:
      typeof o.apiBaseUrl === "string" && o.apiBaseUrl.trim()
        ? o.apiBaseUrl.trim().replace(/\/$/, "")
        : base.apiBaseUrl,
    filialId: typeof o.filialId === "string" ? o.filialId.trim() : undefined,
    filialName: typeof o.filialName === "string" ? o.filialName.trim() : undefined,
    inboundToken: typeof o.inboundToken === "string" ? o.inboundToken : undefined,
    scheduleDays:
      typeof o.scheduleDays === "number" && o.scheduleDays > 0
        ? Math.min(90, Math.floor(o.scheduleDays))
        : base.scheduleDays,
    pushServices: o.pushServices !== false,
    lastSchedulePushAt:
      typeof o.lastSchedulePushAt === "string" ? o.lastSchedulePushAt : undefined,
    lastSchedulePushError:
      typeof o.lastSchedulePushError === "string" ? o.lastSchedulePushError : undefined,
    lastServicesPushAt:
      typeof o.lastServicesPushAt === "string" ? o.lastServicesPushAt : undefined,
    lastServicesPushError:
      typeof o.lastServicesPushError === "string" ? o.lastServicesPushError : undefined,
  };
}

export function maskMedflexConfigForClient(
  config: MedflexClinicConfig
): MedflexClinicConfig & { apiTokenSet?: boolean; inboundTokenSet?: boolean } {
  return {
    ...config,
    apiToken: undefined,
    inboundToken: undefined,
    apiTokenSet: Boolean(config.apiToken?.trim()),
    inboundTokenSet: Boolean(config.inboundToken?.trim()),
  };
}

export function mergeMedflexConfigForSave(
  stored: MedflexClinicConfig,
  incoming: Partial<MedflexClinicConfig> & {
    apiToken?: string | null;
    inboundToken?: string | null;
  }
): MedflexClinicConfig {
  const next = parseMedflexConfig({ ...stored, ...incoming });
  if (incoming.apiToken === null || incoming.apiToken === "") {
    next.apiToken = undefined;
  } else if (typeof incoming.apiToken === "string" && incoming.apiToken.trim()) {
    next.apiToken = incoming.apiToken.trim();
  } else {
    next.apiToken = stored.apiToken;
  }
  if (incoming.inboundToken === null || incoming.inboundToken === "") {
    next.inboundToken = undefined;
  } else if (typeof incoming.inboundToken === "string" && incoming.inboundToken.trim()) {
    next.inboundToken = incoming.inboundToken.trim();
  } else {
    next.inboundToken = stored.inboundToken;
  }
  return next;
}

export interface MedflexScheduleCell {
  dt: string;
  time_start: string;
  time_end: string;
  free: boolean;
}

export interface MedflexBookingRequest {
  doctor: {
    id: string;
    lpu_id: string;
    specialty?: { id: string; name: string };
  };
  appointment: {
    dt_start: string;
    dt_end: string;
    is_online?: boolean;
    comment?: string;
    price?: number;
    is_club?: boolean | null;
  };
  client: {
    first_name: string;
    second_name?: string;
    last_name: string;
    mobile_phone: string;
    birthday?: string;
  };
  appointment_source?: string;
  claim_id?: string;
}

export type MedflexClaimStatus = "successfully" | "cancelled";
