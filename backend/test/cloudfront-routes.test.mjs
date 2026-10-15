import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../../terraform/modules/apps/route-rewrite.js", import.meta.url), "utf8")
  .replaceAll("${mobile_domain}", "mobile.comunid.app")
  .replaceAll("${app_domain}", "app.comunid.app")
  .replaceAll("${admin_domain}", "admin.comunid.app")
  .replaceAll("${hero_domain}", "hero.comunid.app")
  .replaceAll("${tenant_domain}", "comunid.app")
  .replaceAll("${tenants_domain}", "tenants.comunid.app")
  .replaceAll("${www_domain}", "www.comunid.app")
  .replaceAll("${root_domain}", "comunid.app");

function rewrite(uri, host = "comunid.app") {
  return runInNewContext(`${source}\nhandler({request:{uri:${JSON.stringify(uri)},headers:{host:{value:${JSON.stringify(host)}}}}})`);
}

test("serves mobile and admin entry points from their prefixes", () => {
  assert.equal(rewrite("/app/").uri, "/app/index.html");
  assert.equal(rewrite("/admin").uri, "/admin/index.html");
  assert.equal(rewrite("/admin/photos").uri, "/admin/index.html");
  assert.equal(rewrite("/b/ana-cloud").uri, "/app/index.html");
});

test("keeps static assets and the landing route unchanged", () => {
  assert.equal(rewrite("/app/assets/index.js").uri, "/app/assets/index.js");
  assert.equal(rewrite("/admin/assets/index.css").uri, "/admin/assets/index.css");
  assert.equal(rewrite("/").uri, "/");
});

test("serves the mobile and admin applications from their subdomains", () => {
  assert.equal(rewrite("/", "mobile.comunid.app").uri, "/app/index.html");
  assert.equal(rewrite("/profiles", "mobile.comunid.app").uri, "/app/index.html");
  assert.equal(rewrite("/assets/app.js", "mobile.comunid.app").uri, "/app/assets/app.js");
  assert.equal(rewrite("/", "app.comunid.app").uri, "/app/index.html");
  assert.equal(rewrite("/profiles", "app.comunid.app").uri, "/app/index.html");
  assert.equal(rewrite("/assets/app.js", "app.comunid.app").uri, "/app/assets/app.js");
  assert.equal(rewrite("/", "admin.comunid.app").uri, "/admin/index.html");
  assert.equal(rewrite("/faces", "admin.comunid.app").uri, "/admin/index.html");
});

test("serves the hero broadcaster from its subdomain", () => {
  assert.equal(rewrite("/", "hero.comunid.app").uri, "/hero.html");
  assert.equal(rewrite("/start", "hero.comunid.app").uri, "/hero.html");
  assert.equal(rewrite("/assets/hero.js", "hero.comunid.app").uri, "/assets/hero.js");
  assert.equal(rewrite("/app/heros/hero-matias-kreder.png", "hero.comunid.app").uri, "/app/heros/hero-matias-kreder.png");
});

test("redirects www to the root domain", () => {
  const response = rewrite("/about", "www.comunid.app");
  assert.equal(response.statusCode, 301);
  assert.equal(response.headers.location.value, "https://comunid.app/about");
});


test("tenant portal preserves shared apps, QR routes, and static assets", () => {
  assert.equal(rewrite("/", "tenants.comunid.app").uri, "/tenants.html");
  assert.equal(rewrite("/index.html", "tenants.comunid.app").uri, "/tenants.html");
  assert.equal(rewrite("/app/b/same-profile", "tenants.comunid.app").uri, "/app/index.html");
  assert.equal(rewrite("/admin/", "tenants.comunid.app").uri, "/admin/index.html");
  assert.equal(rewrite("/somos.html", "tenants.comunid.app").uri, "/somos.html");
  assert.equal(rewrite("/assets/tenants.js", "tenants.comunid.app").uri, "/assets/tenants.js");
});

test("serves a community subdomain as its mobile app while preserving its other pages", () => {
  assert.equal(rewrite("/", "cordoba.comunid.app").uri, "/app/index.html");
  assert.equal(rewrite("/b/alex", "cordoba.comunid.app").uri, "/app/index.html");
  assert.equal(rewrite("/app/assets/mobile.js", "cordoba.comunid.app").uri, "/app/assets/mobile.js");
  assert.equal(rewrite("/admin/", "cordoba.comunid.app").uri, "/admin/index.html");
  assert.equal(rewrite("/somos.html", "cordoba.comunid.app").uri, "/somos.html");
  assert.equal(rewrite("/hero.html", "cordoba.comunid.app").uri, "/hero.html");
  assert.equal(rewrite("/assets/somos.js", "cordoba.comunid.app").uri, "/assets/somos.js");
});

test("the independent stack serves its portal without reusing Argentina host mappings", () => {
  const template = readFileSync(new URL("../../terraform/modules/apps/route-rewrite.js", import.meta.url), "utf8");
  const domains = { mobile_domain: "", app_domain: "", admin_domain: "", hero_domain: "", somos_domain: "", www_domain: "", tenant_domain: "comunid.app", tenants_domain: "tenants.comunid.app", root_domain: "tenants.comunid.app" };
  const code = template.replace(/\$\{([a-z_]+)\}/g, (_, key) => domains[key]);
  const route = (uri, host) => runInNewContext(`${code}\nhandler({request:{uri:${JSON.stringify(uri)},headers:{host:{value:${JSON.stringify(host)}}}}})`).uri;
  assert.equal(route("/", "tenants.comunid.app"), "/tenants.html");
  assert.equal(route("/", "cordoba.comunid.app"), "/app/index.html");
  assert.equal(route("/b/alex", "cordoba.comunid.app"), "/app/index.html");
  assert.equal(route("/admin/", "cordoba.comunid.app"), "/admin/index.html");
  assert.equal(route("/somos.html", "cordoba.comunid.app"), "/somos.html");
});
