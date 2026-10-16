import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
async function load(hostname: string, search = "") {
  vi.stubGlobal("window", { location: { hostname, search } });
  vi.stubGlobal("document", { body: { textContent: "" } });
  return import("../../shared/tenant");
}
it("derives the tenant and scopes API URLs, storage, and QR links", async () => {
  const tenant = await load("cordoba.comunid.app");
  expect(tenant.tenantId).toBe("cordoba");
  expect(tenant.tenantApiBase("https://api.example/")).toBe("https://api.example/t/cordoba");
  expect(tenant.tenantStorageKey("passport")).toBe("passport:tenant:cordoba");
  expect(tenant.tenantProfileUrl("https://cordoba.comunid.app", "alex")).toBe("https://cordoba.comunid.app/b/alex");
});
it("keeps legacy event URLs and storage compatible", async () => {
  const tenant = await load("mobile.comunid.app");
  expect(tenant.tenantId).toBe("");
  expect(tenant.tenantApiBase("https://api.example")).toBe("https://api.example");
  expect(tenant.tenantStorageKey("passport")).toBe("passport");
});
it("supports tenant development locally", async () => {
  const tenant = await load("127.0.0.1", "?tenant=cordoba");
  expect(tenant.tenantId).toBe("cordoba");
  expect(tenant.tenantProfileUrl("http://127.0.0.1:5190", "alex")).toBe("http://127.0.0.1:5190/b/alex?tenant=cordoba");
});
it("rejects ambiguous tenant selection", async () => {
  await expect(load("cordoba.comunid.app", "?tenant=bravo")).rejects.toThrow("Comunidad inválida");
});
it("rejects invalid explicit tenants instead of falling back", async () => {
  await expect(load("127.0.0.1", "?tenant=../admin")).rejects.toThrow("Comunidad inválida");
});
it("requires a community when opening an app on the portal host", async () => {
  await expect(load("tenants.comunid.app")).rejects.toThrow("Comunidad inválida");
});

it("pins native builds to reInvent and creates public QR links", async () => {
  vi.stubEnv("VITE_FIXED_TENANT_ID", "reinvent");
  const tenant = await load("localhost");
  expect(tenant.tenantId).toBe("reinvent");
  expect(tenant.tenantApiBase("https://api.example")).toBe("https://api.example/t/reinvent");
  expect(tenant.tenantProfileUrl("https://localhost", "member-alex")).toBe("https://reinvent.comunid.app/b/member-alex");
});
it.each([
  ["localhost", "?tenant=argentina"],
  ["argentina.comunid.app", ""],
])("refuses switching a fixed native tenant via host or query", async (host, search) => {
  vi.stubEnv("VITE_FIXED_TENANT_ID", "reinvent");
  await expect(load(host, search)).rejects.toThrow("Comunidad inválida");
});
