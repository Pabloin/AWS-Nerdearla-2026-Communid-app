import "./tenants.css";

const tenantDomain = import.meta.env.VITE_TENANT_DOMAIN || "comunid.app";
const apiBase = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
let token = "";
const app = document.querySelector("#app");
app.innerHTML = `<header><a href="https://comunid.app">comunid<span>✳</span></a><small>COMUNIDADES</small><button id="logout" hidden>Salir</button></header>
<main><p class="eyebrow">UN ESPACIO PARA CADA COMUNIDAD</p><h1>Encuentros propios.<br><em>Historias compartidas.</em></h1><p>Creá comunidades con sus participantes, pasaportes y acceso de organización.</p>
<section id="login"><h2>Administración de la plataforma</h2><form id="login-form"><label>Token de plataforma<input id="token" type="password" autocomplete="off" required /></label><button>Entrar ↗</button></form></section>
<div id="workspace" hidden><section><h2>Crear comunidad</h2><form id="create-form"><label>Nombre<input name="name" maxlength="100" required placeholder="Comunidad Córdoba" /></label><label>Identificador<input name="id" pattern="[a-z0-9][a-z0-9-]{1,47}" maxlength="48" required placeholder="cordoba" /><small>Entre 2 y 48 letras minúsculas, números o guiones.</small></label><label>Evento<input name="eventId" pattern="[a-zA-Z0-9-]{2,80}" maxlength="80" required placeholder="encuentro-2026" /></label><button>Crear comunidad +</button></form></section>
<section id="credentials" hidden><h2>Guardá el acceso de organización</h2><p>Este token se muestra una sola vez. Compartilo de forma privada con quien administra esta comunidad.</p><textarea id="new-token" readonly aria-label="Token de la comunidad"></textarea><button id="copy-token" type="button">Copiar token</button></section>
<section><h2>Tus comunidades</h2><div id="list"></div></section></div><p id="status" role="status" aria-live="polite"></p></main>`;
const $ = (id) => document.getElementById(id);
const status = (message) => { $("status").textContent = message; };
async function request(method, body) {
  if (!apiBase) throw new Error("Falta configurar la API de Comunid.");
  const response = await fetch(`${apiBase}/tenants`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(({ platform_authorization_required: "El token de plataforma no es válido.", tenant_exists: "Ese identificador ya está en uso.", invalid_tenant: "Revisá el nombre, identificador y evento." })[data.error] || "No pudimos completar la operación.");
  return data;
}
async function refresh() {
  const data = await request("GET");
  $("list").replaceChildren();
  if (!data.tenants.length) $("list").textContent = "Todavía no hay comunidades. Creá la primera.";
  for (const tenant of data.tenants) {
    const card = document.createElement("article");
    const name = document.createElement("h3"); name.textContent = tenant.name;
    const detail = document.createElement("p"); detail.textContent = `${tenant.id} · ${tenant.eventId}`;
    card.append(name, detail);
    for (const [label, path] of [["Abrir app", "/"], ["Organizar", "/admin/"], ["Registro", "/somos.html"]]) {
      const link = document.createElement("a"); link.textContent = label; link.href = `https://${tenant.id}.${tenantDomain}${path}`; card.append(link);
    }
    $("list").append(card);
  }
}
$("login-form").onsubmit = async (event) => {
  event.preventDefault(); token = $("token").value.trim();
  try { await refresh(); $("token").value = ""; $("login").hidden = true; $("workspace").hidden = false; $("logout").hidden = false; status(""); }
  catch (error) { token = ""; status(error.message); }
};
$("create-form").onsubmit = async (event) => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  $("credentials").hidden = true; $("new-token").value = "";
  try {
    const data = await request("POST", Object.fromEntries(new FormData(event.target)));
    $("new-token").value = data.adminToken; $("credentials").hidden = false;
    event.target.reset(); status("Comunidad creada. Guardá el token antes de salir.");
    await refresh();
  } catch (error) { status(error.message); }
  finally { button.disabled = false; }
};
$("copy-token").onclick = async () => {
  try { await navigator.clipboard.writeText($("new-token").value); status("Token copiado."); }
  catch { status("Seleccioná el token y copialo manualmente."); }
};
$("logout").onclick = () => { token = ""; $("new-token").value = ""; $("credentials").hidden = true; $("workspace").hidden = true; $("list").replaceChildren(); $("login").hidden = false; $("logout").hidden = true; status(""); };
