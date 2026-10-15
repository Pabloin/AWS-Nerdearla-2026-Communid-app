// A malformed explicit tenant must never fall back to the existing event.
const reserved = new Set(["www", "app", "mobile", "admin", "hero", "somos", "tenants", "default", "api", "mail", "staging", "production"]);
const domain = import.meta.env.VITE_TENANT_DOMAIN || "comunid.app";
const host = window.location.hostname.toLowerCase();
const subdomain = host.endsWith(`.${domain}`) ? host.slice(0, -domain.length - 1) : "";
const queryTenant = new URLSearchParams(window.location.search).get("tenant") || "";
export const tenantId = subdomain && !reserved.has(subdomain) ? subdomain : queryTenant;
if ((tenantId && (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(tenantId) || reserved.has(tenantId))) || (!tenantId && host === `tenants.${domain}`) || (queryTenant && subdomain && !reserved.has(subdomain) && queryTenant !== subdomain)) {
  document.body.textContent = "Falta una comunidad válida en el enlace. Volvé al panel de comunidades.";
  throw new Error("Comunidad inválida");
}
export const tenantStorageKey = (key) => tenantId ? `${key}:tenant:${tenantId}` : key;
export const tenantApiBase = (base) => {
  const root = String(base || "").replace(/\/$/, "");
  return root && tenantId ? `${root}/t/${tenantId}` : root;
};
export const tenantProfileUrl = (base, id) => {
  const url = new URL(`${String(base).replace(/\/$/, "")}/b/${encodeURIComponent(id)}`);
  // Local development uses a query parameter; production uses the tenant host.
  if (tenantId && !url.hostname.endsWith(`.${domain}`)) url.searchParams.set("tenant", tenantId);
  return url.toString();
};
