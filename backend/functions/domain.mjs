import { randomUUID } from "node:crypto";
import { countryCode } from "../../shared/countries.js";

export const communityRoles = ["hero", "builder", "student", "connector", "legend"];

function text(value, max, fallback = "") {
  const normalized = String(value ?? fallback).trim();
  return normalized.slice(0, max);
}

export function normalizeProfile(input = {}) {
  const role = text(input.role, 24).toLowerCase();
  if (!communityRoles.includes(role)) throw new Error("invalid_profile_role");

  const name = text(input.name, 100);
  if (!name) throw new Error("profile_name_required");

  return {
    ...(input.countryCode ? { countryCode: countryCode(input.countryCode) } : {}),
    id: text(input.id, 80) || randomUUID(),
    name,
    role,
    title: text(input.title, 120),
    city: text(input.city, 80),
    community: text(input.community, 120),
    superpower: text(input.superpower, 180),
    askMeAbout: text(input.askMeAbout, 180),
    story: text(input.story, 800),
    color: /^#[0-9a-f]{6}$/i.test(text(input.color, 7)) ? text(input.color, 7).toUpperCase() : "#C8FF3D",
    consent: input.consent === true,
    faceConsent: input.faceConsent === true
  };
}

export function encounterKeys({ eventId, playerId, profileId }) {
  const event = text(eventId, 80);
  const player = text(playerId, 80);
  const profile = text(profileId, 80);
  if (!event || !player || !profile) throw new Error("encounter_fields_required");
  return {
    pk: `PLAYER#${player}`,
    sk: `ENCOUNTER#${event}#${profile}`,
    eventId: event,
    playerId: player,
    profileId: profile
  };
}

export function publicProfileUrl(baseUrl, profileId) {
  return `${String(baseUrl).replace(/\/$/, "")}/b/${encodeURIComponent(profileId)}`;
}
