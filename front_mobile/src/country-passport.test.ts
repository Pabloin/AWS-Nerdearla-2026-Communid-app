import { expect, it } from "vitest";
import { collectedCountries, mapCountryCode } from "./country-passport";
import { countryCode, countryExperience, countries } from "../../shared/countries";
import type { Encounter } from "./domain";
const encounter = (builderId: string, code?: string, extra: Partial<Encounter> = {}): Encounter => ({builderId,eventId:"reinvent-2026",collectedAt:"2026-12-01T10:00:00Z",countryCode:code,...extra});
it("unlocks a country once while counting distinct people from the same country",()=>{
  const items=collectedCountries([encounter("a","AR"),encounter("b","AR"),encounter("c","PY"),encounter("a","US")]);
  expect(items.map(item=>[item.code,item.encounters])).toEqual([["AR",2],["PY",1]]);
});
it("ignores unknown or missing countries and preserves the first encounter date",()=>{
  const items=collectedCountries([encounter("a","ZZ"),encounter("b"),encounter("c","AR"),encounter("d","AR",{collectedAt:"2026-11-30T10:00:00Z"})]);
  expect(items).toHaveLength(1); expect(items[0].firstCollectedAt).toBe("2026-11-30T10:00:00Z");
});
it("keeps country validation and experience selection explicit",()=>{
  expect(countries.length).toBeGreaterThan(240);
  expect(countryCode(" ar ")).toBe("AR"); expect(countryCode("")).toBeNull();
  expect(()=>countryCode("ZZ")).toThrow("invalid_country"); expect(()=>countryCode("Argentina")).toThrow();
  expect(countryExperience("reinvent")).toBe(true); expect(countryExperience("argentina")).toBe(false); expect(countryExperience("")).toBe(false);
});

it("maps island groups to the same country collection",()=>{expect(mapCountryCode("um-dq")).toBe("UM");expect(mapCountryCode("um-wq")).toBe("UM");expect(mapCountryCode("go")).toBe("TF");expect(mapCountryCode("ar")).toBe("AR");});
