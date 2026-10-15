import { tenantApiBase, tenantStorageKey, tenantId } from "../shared/tenant.js";
import "./hero.css";

const apiBase = tenantApiBase(import.meta.env.VITE_API_BASE_URL);
const tokenKey = tenantStorageKey("comunid:hero-access");
const profileKey = tenantStorageKey("comunid:hero-profile");
const heroes = new Map(tenantId ? [] : [
  ["matias-kreder", "Matias Kreder"],
  ["rossana-suarez", "Rossana Suarez (Roxs)"],
  ["ricardo-ceci", "Ricardo Ceci"],
  ["damian-olguin", "Damian Olguin"],
]);
const heroPhotoFiles = {
  "matias-kreder": "hero-matias-kreder.png",
  "rossana-suarez": "hero-rossana-suarez.png",
  "ricardo-ceci": "hero-ricardo-ceci.png",
  "damian-olguin": "hero-damian-olguin.png",
};
const select = document.querySelector("#hero-select");
const qr = document.querySelector("#hero-qr");
const status = document.querySelector("#status");
const start = document.querySelector("#start");
const stop = document.querySelector("#stop");
const access = document.querySelector("#access");
const code = document.querySelector("#hero-code");
const map = document.querySelector("#hero-map");
const mapFrame = document.querySelector("#map-frame");
const mapAccuracy = document.querySelector("#map-accuracy");
let token = sessionStorage.getItem(tokenKey) || "";
let authorizedHeroId = sessionStorage.getItem(profileKey) || "";
let watchId = null;
let heartbeat = null;
let lastSent = 0;
let sending = false;
let pendingPublish = null;

function showPublishedPosition(latitude, longitude, accuracy) {
  const latitudeSpan = 0.0025;
  const longitudeSpan = latitudeSpan / Math.max(Math.cos(latitude * Math.PI / 180), 0.2);
  const query = new URLSearchParams({
    bbox: [longitude - longitudeSpan, latitude - latitudeSpan, longitude + longitudeSpan, latitude + latitudeSpan].join(","),
    layer: "mapnik",
    marker: `${latitude},${longitude}`,
  });
  mapFrame.src = `https://www.openstreetmap.org/export/embed.html?${query}`;
  mapAccuracy.textContent = `Precisión aproximada ±${Math.round(accuracy)} m`;
  map.hidden = false;
}

function hidePublishedPosition() {
  map.hidden = true;
  mapFrame.removeAttribute("src");
}

function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle("error", error);
}

function showSelectedHero() {
  const id = select.value;
  qr.hidden = !id;
  if (id) {
    document.querySelector("#hero-photo").hidden = !heroPhotoFiles[id] || Boolean(tenantId);
    document.querySelector("#hero-photo").src = `/app/heros/${heroPhotoFiles[id]}`;
    document.querySelector("#hero-photo").alt = `Foto de ${heroes.get(id)}`;
    document.querySelector("#qr-image").src = `${apiBase}/profiles/${id}/qr`;
    document.querySelector("#qr-image").alt = `QR de ${heroes.get(id)}`;
    document.querySelector("#qr-name").textContent = heroes.get(id);
  }
  const canShare = id && authorizedHeroId === id;
  start.hidden = !canShare || watchId !== null;
  access.hidden = !id || Boolean(canShare);
  if (!id) message("Elegí tu Hero para empezar.");
  else if (!canShare) message("Tu QR está listo. Para emitir ubicación, ingresá el código privado de este Hero.");
  else if (watchId === null) message("QR listo. La ubicación está apagada.");
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { authorization: `Hero ${token}`, "x-hero-profile-id": authorizedHeroId || select.value, ...(options.body ? { "content-type": "application/json" } : {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

async function authorize(candidate) {
  const entered = candidate.trim();
  if (/^hero$/i.test(entered)) {
    if (!select.value) return message("Primero elegí tu nombre.", true);
    token = "HERO";
    authorizedHeroId = select.value;
  } else {
    token = entered.includes("#") ? entered.split("#").pop() : entered;
  }
  try {
    const result = await request("/heroes/me");
    if (!heroes.has(result.profileId)) throw new Error("hero_not_in_event");
    if (/^hero$/i.test(entered) && result.profileId !== select.value) throw new Error("hero_mismatch");
    authorizedHeroId = result.profileId;
    sessionStorage.setItem(tokenKey, token);
    sessionStorage.setItem(profileKey, authorizedHeroId);
    select.value = result.profileId;
    code.value = "";
    showSelectedHero();
    message(`Acceso de ${heroes.get(result.profileId)} habilitado. La ubicación sigue apagada.`);
  } catch {
    token = "";
    authorizedHeroId = "";
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(profileKey);
    showSelectedHero();
    message(tenantId ? "El enlace privado no es válido para esta comunidad." : "El código es HERO. Revisá también que hayas elegido tu nombre.", true);
  }
}

async function publish(position) {
  if (watchId === null || sending || Date.now() - lastSent < 15000) return;
  sending = true;
  try {
    const { latitude, longitude, accuracy } = position.coords;
    pendingPublish = request("/heroes/me/location", { method: "PUT", body: JSON.stringify({ latitude, longitude, accuracy }) });
    await pendingPublish;
    lastSent = Date.now();
    if (watchId !== null) showPublishedPosition(latitude, longitude, accuracy);
    message(`Compartiendo ubicación · precisión aproximada ${Math.round(accuracy)} m · actualizado ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`);
  } catch {
    message("No pudimos actualizar tu ubicación. Revisá la conexión.", true);
  } finally {
    pendingPublish = null;
    sending = false;
  }
}

function readPosition() {
  navigator.geolocation.getCurrentPosition(publish, () => message("No pudimos obtener tu ubicación. Revisá el permiso del navegador.", true),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 });
}

select.addEventListener("change", showSelectedHero);
document.querySelector("#connect").addEventListener("click", () => {
  const candidate = code.value.trim();
  if (!candidate) return message("Ingresá el código HERO.", true);
  void authorize(candidate);
});

start.addEventListener("click", () => {
  if (!navigator.geolocation) return message("Este navegador no permite compartir ubicación.", true);
  message("Pidiendo permiso de ubicación…");
  watchId = navigator.geolocation.watchPosition(publish, () => message("No pudimos obtener tu ubicación. Revisá el permiso del navegador.", true),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 });
  heartbeat = setInterval(readPosition, 30000);
  select.disabled = true;
  start.hidden = true;
  stop.hidden = false;
});

stop.addEventListener("click", async () => {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  clearInterval(heartbeat);
  stop.disabled = true;
  try {
    if (pendingPublish) await pendingPublish.catch(() => undefined);
    await request("/heroes/me/location", { method: "DELETE" });
    hidePublishedPosition();
    message("Dejaste de compartir tu ubicación. El QR sigue disponible.");
    start.hidden = false;
    stop.hidden = true;
  } catch {
    message("No pudimos detener la ubicación en el servidor. Probá otra vez; si no hay actualizaciones desaparece en 10 minutos.", true);
  } finally {
    select.disabled = false;
    stop.disabled = false;
  }
});

async function initialize() {
  const fragment = decodeURIComponent(location.hash.slice(1));
  if (fragment) history.replaceState(null, "", location.pathname + location.search);
  if (tenantId) {
    select.replaceChildren(new Option("Elegí tu Hero", ""));
    try {
      const response = await fetch(`${apiBase}/profiles`);
      if (!response.ok) throw new Error();
      const { profiles } = await response.json();
      for (const profile of profiles.filter((item) => item.role === "hero")) {
        heroes.set(profile.id, profile.name);
        select.add(new Option(profile.name, profile.id));
      }
    } catch { return message("No pudimos cargar los Heroes de esta comunidad.", true); }
  }
  if (authorizedHeroId && heroes.has(authorizedHeroId)) select.value = authorizedHeroId;
  if (fragment) await authorize(fragment);
  else if (token) await authorize(token);
  else showSelectedHero();
}
void initialize();
