export const roles = ["hero", "builder", "student", "connector", "legend"] as const;

export type CommunityRole = (typeof roles)[number];

export type BuilderProfile = {
  id: string;
  name: string;
  role: CommunityRole;
  title: string;
  city: string;
  community: string;
  superpower: string;
  askMeAbout: string;
  story: string;
  color: string;
};

export type Encounter = {
  builderId: string;
  collectedAt: string;
  eventId: string;
};

export type Quest = {
  id: string;
  title: string;
  description: string;
  target: number;
  role?: CommunityRole;
};

export const roleLabels: Record<CommunityRole, string> = {
  hero: "Hero",
  builder: "Builder",
  student: "Student",
  connector: "Connector",
  legend: "Legend"
};

export function profileIdFromQr(payload: string, tenantId = "", tenantDomain = "comunid.app"): string {
  const normalized = payload.trim();
  if (normalized.startsWith("comunid:builder:")) {
    return tenantId ? "" : normalized.slice("comunid:builder:".length);
  }

  try {
    const url = new URL(normalized);
    const reserved = new Set(["www", "app", "mobile", "admin", "hero", "somos", "tenants"]);
    const subdomain = url.hostname.endsWith(`.${tenantDomain}`) ? url.hostname.slice(0, -tenantDomain.length - 1) : "";
    const badgeTenant = subdomain && !reserved.has(subdomain) ? subdomain : url.searchParams.get("tenant") || "";
    if (badgeTenant !== tenantId) return "";
    const match = url.pathname.match(/^\/(?:app\/)?b\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

export function questProgress(quest: Quest, profiles: BuilderProfile[], encounters: Encounter[]): number {
  const uniqueIds = new Set(encounters.map((encounter) => encounter.builderId));
  return profiles.filter((profile) => uniqueIds.has(profile.id) && (!quest.role || profile.role === quest.role)).length;
}

export function collectEncounter(current: Encounter[], builderId: string, eventId = "nerdearla-2026"): Encounter[] {
  if (current.some((encounter) => encounter.builderId === builderId && encounter.eventId === eventId)) return current;
  return [{ builderId, eventId, collectedAt: new Date().toISOString() }, ...current];
}
