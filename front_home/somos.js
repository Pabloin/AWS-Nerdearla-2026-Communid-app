import { tenantApiBase, tenantStorageKey, tenantId } from "../shared/tenant.js";
import "./hero.css";

const apiBase = tenantApiBase(import.meta.env.VITE_API_BASE_URL);
const tokenKey = tenantStorageKey("comunid:community-access");
const profileKey = tenantStorageKey("comunid:community-profile");
const oldTokenKey = tenantStorageKey("comunid:hero-access");
const oldProfileKey = tenantStorageKey("comunid:hero-profile");
const registration = document.querySelector("#registration");
const nameInput = document.querySelector("#name");
let communityInput = document.querySelector("#community");
if (tenantId) {
  const input = document.createElement("input");
  input.id = "community"; input.name = "community"; input.required = true; input.maxLength = 120; input.value = tenantId;
  communityInput.replaceWith(input); communityInput = input;
  document.querySelector("header span").textContent = `SOMOS · ${tenantId.toUpperCase()}`;
  fetch(`${apiBase}/health`).then((response) => response.ok ? response.json() : Promise.reject()).then((data) => {
    if (data.tenant?.name) {
      document.querySelector("header span").textContent = `SOMOS · ${data.tenant.name.toUpperCase()}`;
      if (communityInput.value === tenantId) communityInput.value = data.tenant.name;
    }
  }).catch(() => undefined);
}
const roleInput = document.querySelector("#role");
const photoInput = document.querySelector("#photo");
const photoPreview = document.querySelector("#photo-preview");
const cameraButton = document.querySelector("#camera-button");
const cameraPreview = document.querySelector("#camera-preview");
const capturePhoto = document.querySelector("#capture-photo");
const joinButton = document.querySelector("#join");
const qr = document.querySelector("#hero-qr");
const profileEdit = document.querySelector("#profile-edit");
const profileNameInput = document.querySelector("#profile-name");
const status = document.querySelector("#status");
const start = document.querySelector("#start");
const stop = document.querySelector("#stop");
const map = document.querySelector("#hero-map");
const mapFrame = document.querySelector("#map-frame");
const mapAccuracy = document.querySelector("#map-accuracy");
let token = sessionStorage.getItem(tokenKey) || (!tenantId && sessionStorage.getItem(oldTokenKey)) || "";
let profileId = sessionStorage.getItem(profileKey) || (!tenantId && sessionStorage.getItem(oldProfileKey)) || "";
let profileName = "";
let watchId = null;
let heartbeat = null;
let lastSent = 0;
let sending = false;
let pendingPublish = null;
let photoDataUrl = "";
let cameraStream = null;

function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle("error", error);
}

function showProfile(profile) {
  profileId = profile.profileId || profile.id;
  profileName = profile.name;
  registration.hidden = true;
  qr.hidden = false;
  profileEdit.hidden = false;
  profileNameInput.value = profile.name;
  document.querySelector("#qr-name").textContent = profile.name;
  document.querySelector("#qr-community").textContent = profile.community || "";
  const qrPhoto = document.querySelector("#qr-photo");
  if (photoDataUrl) {
    qrPhoto.src = photoDataUrl;
    qrPhoto.hidden = false;
  } else if (profileId.startsWith("member-")) {
    qrPhoto.src = apiBase + "/profiles/" + profileId + "/photo";
    qrPhoto.hidden = false;
  } else {
    qrPhoto.hidden = true;
  }
  document.querySelector("#qr-image").src = apiBase + "/profiles/" + profileId + "/qr";
  document.querySelector("#qr-image").alt = "QR de " + profile.name;
  start.hidden = false;
  message("Tu perfil está listo. La ubicación está apagada.");
}

async function imageAsDataUrl(file) {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 640 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return canvas.toDataURL("image/jpeg", 0.72);
}

function stopCamera() {
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  cameraPreview.srcObject = null;
  cameraPreview.hidden = true;
  capturePhoto.hidden = true;
  cameraButton.textContent = photoDataUrl ? "Volver a sacar la foto" : "Sacar una foto";
}

cameraButton.addEventListener("click", async () => {
  if (cameraStream) {
    stopCamera();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    message("Este navegador no permite abrir la cámara. Elegí una foto de tu dispositivo.", true);
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    cameraPreview.srcObject = cameraStream;
    cameraPreview.hidden = false;
    photoPreview.hidden = true;
    capturePhoto.hidden = false;
    cameraButton.textContent = "Cancelar cámara";
    await cameraPreview.play();
  } catch {
    stopCamera();
    message("No pudimos abrir la cámara. Revisá el permiso del navegador o elegí una foto.", true);
  }
});

capturePhoto.addEventListener("click", () => {
  if (!cameraPreview.videoWidth || !cameraPreview.videoHeight) {
    message("La cámara todavía se está iniciando. Probá de nuevo en un instante.", true);
    return;
  }
  const scale = Math.min(1, 640 / Math.max(cameraPreview.videoWidth, cameraPreview.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(cameraPreview.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(cameraPreview.videoHeight * scale));
  canvas.getContext("2d").drawImage(cameraPreview, 0, 0, canvas.width, canvas.height);
  photoDataUrl = canvas.toDataURL("image/jpeg", 0.72);
  photoPreview.src = photoDataUrl;
  photoPreview.hidden = false;
  stopCamera();
  message("Foto lista. Se publicará junto con tu perfil.");
});

photoInput.addEventListener("change", async () => {
  const file = photoInput.files?.[0];
  if (!file) return;
  try {
    stopCamera();
    photoDataUrl = await imageAsDataUrl(file);
    photoPreview.src = photoDataUrl;
    photoPreview.hidden = false;
    cameraButton.textContent = "Volver a sacar la foto";
    message("Foto lista. Se publicará junto con tu perfil.");
  } catch {
    message("No pudimos leer esa foto. Probá con otra imagen.", true);
  }
});

window.addEventListener("pagehide", stopCamera);

registration.addEventListener("submit", async (event) => {
  event.preventDefault();
  stopCamera();
  joinButton.disabled = true;
  message("Creando tu perfil…");
  try {
    const response = await fetch(apiBase + "/community/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nameInput.value.trim(), role: roleInput.value, community: communityInput.value, photoDataUrl }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errors = { community_invalid: "Elegí una comunidad de la lista.", community_role_invalid: "Elegí cómo te sumás a la comunidad.", community_name_invalid: "Escribí tu nombre para crear el perfil.", photo_invalid: "La foto no es válida; probá con otra imagen." };
      throw new Error(errors[result.error] || "No pudimos crear tu perfil.");
    }
    token = result.token;
    profileId = result.profileId;
    profileName = result.name;
    sessionStorage.setItem(tokenKey, token);
    sessionStorage.setItem(profileKey, profileId);
    sessionStorage.removeItem(oldTokenKey);
    sessionStorage.removeItem(oldProfileKey);
    showProfile(result);
  } catch (error) {
    message(error instanceof Error ? error.message : "No pudimos crear tu perfil. Revisá la conexión.", true);
  } finally {
    joinButton.disabled = false;
  }
});

async function request(path, options = {}) {
  const response = await fetch(apiBase + path, {
    ...options,
    headers: { authorization: "Community " + token,
      ...(options.body ? { "content-type": "application/json" } : {}) },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "HTTP " + response.status);
  return result;
}

profileEdit.addEventListener("submit", async (event) => {
  event.preventDefault();
  const save = profileEdit.querySelector("button");
  save.disabled = true;
  try {
    const result = await request("/community/me/profile", {
      method: "PUT",
      body: JSON.stringify({ name: profileNameInput.value.trim() }),
    });
    profileName = result.name;
    profileNameInput.value = result.name;
    document.querySelector("#qr-name").textContent = result.name;
    document.querySelector("#qr-image").alt = "QR de " + result.name;
    message("Tu nombre se actualizó.");
  } catch (error) {
    message(error instanceof Error && error.message === "community_name_invalid"
      ? "Escribí un nombre de 2 a 80 caracteres."
      : "No pudimos actualizar tu nombre. Revisá la conexión.", true);
  } finally {
    save.disabled = false;
  }
});

function showPublishedPosition(latitude, longitude, accuracy) {
  const latSpan = 0.0025;
  const lonSpan = latSpan / Math.max(Math.cos(latitude * Math.PI / 180), 0.2);
  const query = new URLSearchParams({
    bbox: [longitude - lonSpan, latitude - latSpan, longitude + lonSpan, latitude + latSpan].join(","),
    layer: "mapnik",
    marker: latitude + "," + longitude,
  });
  mapFrame.src = "https://www.openstreetmap.org/export/embed.html?" + query;
  mapAccuracy.textContent = "Precisión aproximada ±" + Math.round(accuracy) + " m";
  map.hidden = false;
}

function readPosition() {
  navigator.geolocation.getCurrentPosition(publish, () =>
    message("No pudimos obtener tu ubicación. Revisá el permiso del navegador.", true),
  { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 });
}

async function publish(position) {
  if (watchId === null || sending || Date.now() - lastSent < 15000) return;
  sending = true;
  try {
    const { latitude, longitude, accuracy } = position.coords;
    pendingPublish = request("/community/me/location", {
      method: "PUT",
      body: JSON.stringify({ latitude, longitude, accuracy }),
    });
    await pendingPublish;
    lastSent = Date.now();
    if (watchId !== null) showPublishedPosition(latitude, longitude, accuracy);
    message("Compartiendo ubicación · precisión aproximada " + Math.round(accuracy) + " m · " + profileName);
  } catch (error) {
    const authError = error instanceof Error && error.message === "community_authorization_required";
    message(authError ? "No pudimos validar tu perfil de comunidad. Volvé a cargar la página y probá otra vez." : "No pudimos actualizar tu ubicación. Revisá la conexión.", true);
  } finally {
    pendingPublish = null;
    sending = false;
  }
}

start.addEventListener("click", () => {
  if (!navigator.geolocation) return message("Este navegador no permite compartir ubicación.", true);
  message("Pidiendo permiso de ubicación…");
  watchId = navigator.geolocation.watchPosition(publish, () =>
    message("No pudimos obtener tu ubicación. Revisá el permiso del navegador.", true),
  { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 });
  heartbeat = setInterval(readPosition, 30000);
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
    await request("/community/me/location", { method: "DELETE" });
    map.hidden = true;
    mapFrame.removeAttribute("src");
    message("Dejaste de compartir tu ubicación. Tu perfil sigue visible.");
    start.hidden = false;
    stop.hidden = true;
  } catch {
    message("No pudimos detener la ubicación en el servidor. Si no hay actualizaciones, desaparecerá en 10 minutos.", true);
  } finally {
    stop.disabled = false;
  }
});

// Somos accepts only community profiles. Hero links stay on hero.comunid.app.
if (location.hash) history.replaceState(null, "", location.pathname);
if (token && profileId) {
  request("/community/me").then((result) => showProfile(result))
    .catch(() => {
      sessionStorage.removeItem(tokenKey);
      sessionStorage.removeItem(profileKey);
      sessionStorage.removeItem(oldTokenKey);
      sessionStorage.removeItem(oldProfileKey);
      message("No pudimos recuperar tu perfil. Podés volver a registrarte.", true);
    });
}
