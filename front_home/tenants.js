import "./styles.css";
import "./tenants.css";

const tenantDomain = import.meta.env.VITE_TENANT_DOMAIN || "comunid.app";
const apiBase = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
let token = "";
const app = document.querySelector("#app");
app.innerHTML = `<header class="site-header">
<a class="brand" href="https://comunid.app" aria-label="Comunid, volver al inicio"><img src="/brand/logo-comunid-app.png" alt="Comunid.app" /></a>
<nav aria-label="Navegación del panel"><a href="https://comunid.app">La idea</a><a class="tenant-current" href="#inicio" aria-current="page">Comunidades</a><button id="logout" class="nav-cta" type="button" hidden>Salir ↗</button></nav>
</header>
<main class="tenants-main">
<section class="hero" id="inicio"><div class="hero-inner">
<div class="hero-copy"><p class="eyebrow"><span></span> UN ESPACIO PARA CADA COMUNIDAD</p><h1>Encuentros propios.<br><em>Historias compartidas.</em></h1><p class="hero-lead">Creá comunidades con sus participantes, pasaportes y acceso de organización.</p><p class="hero-signoff">Un lugar para encontrarse. Una experiencia para compartir.</p></div>
<section id="login" class="tenant-access" aria-labelledby="login-title"><p class="section-kicker">PARA QUIENES HACEN COMUNIDAD</p><h2 id="login-title">Tu comunidad<br>empieza acá<span>.</span></h2><p>Entrá para crear y organizar tus experiencias en Comunid.</p><form id="login-form"><label for="token">Clave de administración</label><input id="token" type="password" autocomplete="off" required /><button class="button button-primary" type="submit">Entrar al panel <span aria-hidden="true">↗</span></button></form></section>
<div id="session-panel" class="tenant-access tenant-session" hidden><p class="section-kicker">ADMINISTRACIÓN DE LA PLATAFORMA</p><h2>Más encuentros.<br>Más comunidad<span>.</span></h2><p>Todo listo para organizar tu próxima experiencia.</p><a class="button button-primary" href="#workspace">Ver mis comunidades <span aria-hidden="true">↓</span></a></div>
</div><div class="hero-bottom"><span>PERSONAS &gt; PERFILES</span><a href="https://comunid.app/#comunidades">PERSONAS QUE HACEN COMUNIDAD ↗</a><span>HECHO PARA ENCONTRARNOS</span></div></section>
<div class="section-wrap tenant-content"><p id="status" role="status" aria-live="polite"></p>
<div id="workspace" hidden><section class="tenant-section" aria-labelledby="create-title"><div class="tenant-section-heading"><p class="section-kicker"><span>01 /</span> UNA NUEVA EXPERIENCIA</p><h2 id="create-title">Crear comunidad<span>.</span></h2><p>Un espacio propio para las personas que vas a reunir.</p></div><form id="create-form"><label>Nombre<input name="name" maxlength="100" required placeholder="Comunidad Córdoba" /></label><label>Identificador<input name="id" pattern="[a-z0-9][a-z0-9-]{1,47}" maxlength="48" required placeholder="cordoba" /><small>Entre 2 y 48 letras minúsculas, números o guiones.</small></label><label>Evento<input name="eventId" pattern="[a-zA-Z0-9-]{2,80}" maxlength="80" required placeholder="encuentro-2026" /></label><button class="button button-primary" type="submit">Crear comunidad <span aria-hidden="true">+</span></button></form></section>
<section id="credentials" class="tenant-section tenant-credentials" hidden><h2>Guardá el acceso de organización</h2><p>Este token se muestra una sola vez. Compartilo de forma privada con quien administra esta comunidad.</p><textarea id="new-token" readonly aria-label="Token de la comunidad"></textarea><button id="copy-token" class="button tenant-secondary" type="button">Copiar token</button></section>
<section class="tenant-section" aria-labelledby="list-title"><div class="tenant-section-heading"><p class="section-kicker"><span>02 /</span> ESPACIOS PARA ENCONTRARNOS</p><h2 id="list-title">Tus comunidades<span>.</span></h2></div><div id="list"></div></section></div></div>
</main><footer class="site-footer section-wrap"><a class="brand" href="https://comunid.app" aria-label="Comunid, volver al inicio"><img src="/brand/logo-comunid-app.png" alt="Comunid.app" /></a><p>Personas que hacen comunidad.</p><a class="inline-link" href="https://comunid.app">Conocé Comunid ↗</a><small>© ${new Date().getFullYear()} Comunid</small></footer>`;
const $ = (id) => document.getElementById(id);
const status = (message) => { $("status").textContent = message; };
async function request(method, body) {
  if (!apiBase) throw new Error("Falta configurar la API de Comunid.");
  const response = await fetch(`${apiBase}/tenants`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(({ platform_authorization_required: "La clave de administración no es válida.", tenant_exists: "Ese identificador ya está en uso.", invalid_tenant: "Revisá el nombre, identificador y evento." })[data.error] || "No pudimos completar la operación.");
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
  try { await refresh(); $("token").value = ""; $("login").hidden = true; $("session-panel").hidden = false; $("workspace").hidden = false; $("logout").hidden = false; status(""); }
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
$("logout").onclick = () => { token = ""; $("new-token").value = ""; $("credentials").hidden = true; $("workspace").hidden = true; $("list").replaceChildren(); $("login").hidden = false; $("session-panel").hidden = true; $("logout").hidden = true; status(""); };
