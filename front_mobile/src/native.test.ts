import { describe, expect, it } from "vitest";
import { nativeBadgeUrl } from "./native";
import { profileIdFromQr } from "./domain";

describe("Android re:Invent badge isolation", () => {
  it.each([
    ["https://reinvent.comunid.app/b/alex", "alex"],
    ["comunid-reinvent://b/alex", "alex"],
    ["https://reinvent.comunid.app/app/b/alex", "alex"],
  ])("accepts reInvent badges: %s", (url, id) => {
    expect(profileIdFromQr(nativeBadgeUrl(url) || "", "reinvent")).toBe(id);
  });
  it.each([
    "https://argentina.comunid.app/b/alex",
    "https://evil.example/b/alex?tenant=reinvent",
    "http://reinvent.comunid.app/b/alex",
    "https://reinvent.comunid.app.evil.example/b/alex",
    "https://user:pass@reinvent.comunid.app/b/alex",
    "https://reinvent.comunid.app:8443/b/alex",
    "comunid-reinvent://admin/alex",
    "garbage",
  ])("rejects foreign or untrusted links: %s", (url) => {
    expect(nativeBadgeUrl(url)).toBeNull();
  });
});
