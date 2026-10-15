import { describe, expect, it } from "vitest";
import { collectEncounter, profileIdFromQr, questProgress, type BuilderProfile } from "./domain";

const profiles: BuilderProfile[] = [
  { id: "ana", name: "Ana", role: "builder", title: "", city: "", community: "", superpower: "", askMeAbout: "", story: "", color: "#fff" },
  { id: "luz", name: "Luz", role: "student", title: "", city: "", community: "", superpower: "", askMeAbout: "", story: "", color: "#fff" }
];

describe("QR payloads", () => {
  it("accepts compact and public URL payloads", () => {
    expect(profileIdFromQr("comunid:builder:ana")).toBe("ana");
    expect(profileIdFromQr("https://comunid.app/b/luz")).toBe("luz");
  });
});

describe("collection", () => {
  it("does not count the same encounter twice", () => {
    const once = collectEncounter([], "ana");
    expect(collectEncounter(once, "ana")).toBe(once);
  });

  it("calculates role-specific quest progress", () => {
    const encounters = [
      { builderId: "ana", eventId: "event", collectedAt: "2026-01-01" },
      { builderId: "luz", eventId: "event", collectedAt: "2026-01-01" }
    ];
    expect(questProgress({ id: "q", title: "", description: "", target: 2, role: "builder" }, profiles, encounters)).toBe(1);
  });
});


it("keeps QR badges inside their community", () => {
  expect(profileIdFromQr("https://tenants.comunid.app/app/b/alex?tenant=alpha", "alpha")).toBe("alex");
  expect(profileIdFromQr("https://tenants.comunid.app/app/b/alex?tenant=alpha", "bravo")).toBe("");
  expect(profileIdFromQr("https://tenants.comunid.app/app/b/alex?tenant=alpha")).toBe("");
  expect(profileIdFromQr("https://mobile.comunid.app/b/alex", "alpha")).toBe("");
  expect(profileIdFromQr("comunid:builder:alex", "alpha")).toBe("");
});


it("recognizes the community from the QR subdomain", () => {
  expect(profileIdFromQr("https://alpha.comunid.app/b/alex", "alpha")).toBe("alex");
  expect(profileIdFromQr("https://alpha.comunid.app/b/alex", "bravo")).toBe("");
  expect(profileIdFromQr("https://alpha.comunid.app/b/alex")).toBe("");
});
