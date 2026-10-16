import { tenantStorageKey } from "../../shared/tenant";
export type GuestProfile = {
  id: string;
  name: string;
  email: string | null;
  contactConsent: boolean;
  eventId: string;
  countryCode?: string;
  profileId?: string;
  profileConsent?: boolean;
};

export type GuestSession = {
  guest: GuestProfile;
  token: string;
};

const storageKey = tenantStorageKey("comunid:guest-session");

export function readGuestSession(): GuestSession | null {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
    return stored?.guest?.id && stored?.guest?.name && stored?.token ? stored : null;
  } catch {
    return null;
  }
}

export function saveGuestSession(session: GuestSession | null): void {
  if (session) localStorage.setItem(storageKey, JSON.stringify(session));
  else localStorage.removeItem(storageKey);
}

async function guestRequest<T>(
  apiBaseUrl: string,
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Guest ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = ({ participant_country_required: "Esta persona todavía no indicó su país. Pedile que complete su perfil.", self_encounter_not_allowed: "No podés registrar un encuentro con tu propio QR.", invalid_country: "Elegí un país válido.", country_required: "Completá tu país para publicar tu perfil.", public_profile_consent_required: "Confirmá que aceptás publicar tu nombre y país." } as Record<string,string>)[data.error];
    const error = new Error(message || `guest_api_${response.status}`);
    throw error;
  }
  return response.json() as Promise<T>;
}

export async function createGuest(name: string, email: string, apiBaseUrl: string, details: { countryCode?: string; profileConsent?: boolean } = {}): Promise<GuestSession> {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 60) {
    throw new Error("Ingresá un nombre de 2 a 60 caracteres.");
  }
  if (!apiBaseUrl) {
    return {
      guest: {
        id: crypto.randomUUID(),
        name: normalized,
        email: email.trim() || null,
        contactConsent: false,
        eventId: "nerdearla-2026",
      },
      token: "local-demo",
    };
  }
  return guestRequest<GuestSession>(apiBaseUrl, "/guests", {
    method: "POST",
    body: JSON.stringify({ name: normalized, email: email.trim() || null, ...details }),
  });
}

export async function updateGuestProfile(session: GuestSession, apiBaseUrl: string, name: string, email: string, details: { countryCode?: string; profileConsent?: boolean } = {}): Promise<GuestSession> {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 60) throw new Error("Ingresá un nombre de 2 a 60 caracteres.");
  if (!apiBaseUrl) return { ...session, guest: { ...session.guest, name: normalized, email: email.trim() || null } };
  const result = await guestRequest<{ guest: GuestProfile }>(apiBaseUrl, "/guests/me/profile", {
    method: "PUT", body: JSON.stringify({ name: normalized, email: email.trim() || null, ...details }),
  }, session.token);
  return { ...session, guest: result.guest };
}

export async function refreshGuest(session: GuestSession, apiBaseUrl: string): Promise<GuestSession> {
  if (!apiBaseUrl) return session;
  const result = await guestRequest<{ guest: GuestProfile }>(apiBaseUrl, "/guests/me", {}, session.token);
  return { ...session, guest: result.guest };
}

export async function listGuestEncounters(session: GuestSession, apiBaseUrl: string): Promise<{ encounters: Array<{ profileId: string; collectedAt: string; eventId: string; countryCode?: string; profileName?: string }> }> {
  return guestRequest(apiBaseUrl, "/guests/me/encounters", {}, session.token);
}

export async function recordGuestEncounter(session: GuestSession, apiBaseUrl: string, profileId: string): Promise<{collectedAt:string; countryCode?:string; profileName?:string}> {
  return guestRequest(apiBaseUrl, "/guests/me/encounters", {
    method: "POST",
    body: JSON.stringify({ profileId }),
  }, session.token);
}

export async function setGuestContact(session: GuestSession, apiBaseUrl: string, email: string): Promise<GuestSession> {
  if (!apiBaseUrl) {
    return { ...session, guest: { ...session.guest, email: email.trim().toLowerCase(), contactConsent: true } };
  }
  const result = await guestRequest<{ guest: GuestProfile }>(apiBaseUrl, "/guests/me/contact", {
    method: "PUT",
    body: JSON.stringify({ email, consent: true }),
  }, session.token);
  return { ...session, guest: result.guest };
}

export async function removeGuestContact(session: GuestSession, apiBaseUrl: string): Promise<GuestSession> {
  if (!apiBaseUrl) {
    return { ...session, guest: { ...session.guest, email: null, contactConsent: false } };
  }
  const result = await guestRequest<{ guest: GuestProfile }>(apiBaseUrl, "/guests/me/contact", {
    method: "DELETE",
  }, session.token);
  return { ...session, guest: result.guest };
}
