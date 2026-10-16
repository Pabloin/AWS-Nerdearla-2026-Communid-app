import { countries } from "../../shared/countries";
import type { Encounter } from "./domain";

const names = new Map(countries.map(country => [country.code, country.name]));
export const countryName = (code?: string | null) => names.get(code || "") || "País sin indicar";
export function collectedCountries(encounters: Encounter[]) {
  const seen = new Set<string>();
  const result = new Map<string, { code: string; name: string; encounters: number; firstCollectedAt: string }>();
  for (const encounter of encounters) {
    const key = `${encounter.eventId}:${encounter.builderId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!encounter.countryCode || !names.has(encounter.countryCode)) continue;
    const current = result.get(encounter.countryCode);
    if (current) {
      current.encounters++;
      if (encounter.collectedAt < current.firstCollectedAt) current.firstCollectedAt = encounter.collectedAt;
    } else result.set(encounter.countryCode, { code: encounter.countryCode, name: countryName(encounter.countryCode), encounters: 1, firstCollectedAt: encounter.collectedAt });
  }
  return [...result.values()].sort((a,b) => a.name.localeCompare(b.name, "es"));
}

export const mapCountryCode = (id: string) => ({go:"TF",ju:"TF"} as Record<string,string>)[id] || id.split("-")[0].toUpperCase();
