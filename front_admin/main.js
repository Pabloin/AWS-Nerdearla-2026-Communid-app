import { tenantApiBase, tenantId } from "../shared/tenant.js";
import { countries, countryExperience } from "../shared/countries.js";
import "./styles.css";

const homeUrl = import.meta.env.VITE_HOME_URL || "/";

const state = {
  apiBase: tenantApiBase(import.meta.env.VITE_API_BASE_URL),
  token: "",
  profiles: [],
  image: "",
  faces: [],
  labels: new Map(),
  saved: new Set(),
  selectedProfileId: "",
  busy: false
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

document.querySelector("#app").innerHTML = `
  <header class="topbar"><a class="brand" href="${homeUrl}" aria-label="Comunid"><img src="/brand/logo-comunid-app.png" alt="Comunid.app" /><small>STUDIO</small></a><div class="topbar-right"><span class="environment" id="environment">SIN CONEXIÓN</span><button id="logout" type="button" hidden>Salir</button></div></header>
  <main class="shell">
    <section class="intro"><div><p class="eyebrow">HERRAMIENTAS PARA ORGANIZADORES</p><h1>Las historias tienen <em>rostro.</em></h1><p>Revisá las fotos del evento, identificá a quienes eligieron participar y prepará sus perfiles para el próximo encuentro.</p></div><span class="intro-symbol" aria-hidden="true">✳</span></section>

    <section class="login-panel" id="login-panel"><div><p class="eyebrow">ACCESO PRIVADO</p><h2>Entrá al estudio</h2><p>Usá el token de administración configurado para este entorno. El token queda solo en esta pestaña mientras esté abierta.</p></div><form id="login-form"><label>URL de la API<input id="api-url" type="url" placeholder="https://...execute-api.us-east-1.amazonaws.com" required /></label><label>Token de administrador<input id="admin-token" type="password" autocomplete="off" placeholder="Pegá el token" required /></label><button class="button button-dark" type="submit">Conectar <span>↗</span></button></form></section>

    <div id="workspace" hidden>
      <div class="workspace-heading"><div><p class="eyebrow">MESA DE TRABAJO</p><h2>Etiquetado de fotos</h2></div><p>Primero cargá perfiles con consentimiento. Después subí una foto y elegí a quién corresponde cada rostro.</p></div>
      <div class="workspace-grid">
        <section class="panel photo-panel"><div class="panel-heading"><div><span class="panel-step">01</span><h3>Foto del evento</h3></div><span class="panel-meta">JPG O PNG</span></div><label class="dropzone" id="dropzone"><input id="photo-input" type="file" accept="image/jpeg,image/png" /><span class="upload-icon">↥</span><strong>Elegí una foto</strong><small>Se procesa en esta pestaña. Los originales no se guardan en el backend.</small></label><div class="photo-stage" id="photo-stage" hidden><div class="photo-canvas"><img id="photo-preview" alt="Foto para etiquetar" /><div id="face-boxes"></div></div></div><div class="photo-actions"><button class="button button-dark" id="detect-button" type="button" disabled>Detectar rostros <span>↗</span></button><span id="photo-info">Todavía no cargaste una foto.</span></div></section>

        <section class="panel label-panel"><div class="panel-heading"><div><span class="panel-step">02</span><h3>Revisá y etiquetá</h3></div><span class="panel-meta" id="face-count">0 ROSTROS</span></div><div id="face-list" class="empty-state"><span>⌗</span><h4>Las personas aparecen acá</h4><p>Después de detectar las caras, asigná un perfil a cada una. Las que no etiquetes se ignoran.</p></div><div class="label-actions"><button class="button button-lime" id="save-faces" type="button" disabled>Registrar seleccionados <span>↗</span></button><p>Solo se registran caras vinculadas a perfiles con consentimiento facial.</p></div></section>
      </div>

      <section class="panel people-panel"><div class="panel-heading"><div><span class="panel-step">03</span><h3>Personas participantes</h3></div><button class="plain-button" id="refresh-profiles" type="button">Actualizar ↻</button></div><div class="people-layout"><div><div id="profile-list" class="profile-list"></div><div class="face-registry" id="face-registry"></div></div><form id="profile-form" class="profile-form"><p class="eyebrow">SUMAR A ALGUIEN</p><h4>Nuevo perfil</h4><label>Nombre<input name="name" maxlength="100" required placeholder="Nombre y apellido" /></label><div class="form-row"><label>Rol<select name="role" required><option value="builder">Builder</option><option value="hero">Hero</option><option value="student">Student</option><option value="connector">Connector</option><option value="legend">Legend</option></select></label><label>Ciudad<input name="city" maxlength="80" placeholder="Buenos Aires" /></label></div>${countryExperience(tenantId) ? `<label>País o territorio<select name="countryCode" required><option value="">Elegí un país</option>${countries.map(country=>`<option value="${country.code}">${country.name}</option>`).join("")}</select></label>` : ""}<label>Qué hace<input name="title" maxlength="120" placeholder="Organiza una comunidad de tecnología" /></label><label>Comunidad<input name="community" maxlength="120" placeholder="AWS User Group" /></label><label class="check-label"><input name="consent" type="checkbox" required /> Confirmo que la persona aceptó aparecer en Comunid.</label><label class="check-label"><input name="faceConsent" type="checkbox" /> Confirmo que también aceptó el reconocimiento facial.</label><button class="button button-dark" type="submit">Crear perfil <span>↗</span></button></form></div></section>
    </div>
    <div class="notice" id="notice" role="status" aria-live="polite" hidden></div>
  </main>
`;

const $ = (selector) => document.querySelector(selector);
$("#api-url").value = state.apiBase;

function notice(message, kind = "info") {
  const element = $("#notice");
  element.textContent = message;
  element.dataset.kind = kind;
  element.hidden = false;
  clearTimeout(notice.timeout);
  notice.timeout = setTimeout(() => { element.hidden = true; }, 7000);
}

async function api(path, options = {}) {
  const response = await fetch(`${state.apiBase}${path}`, {
    ...options,
    headers: { "content-type": "application/json", authorization: `Bearer ${state.token}`, ...options.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);
  return data;
}

function friendlyError(error) {
  const labels = {
    admin_authorization_required: "El token no es válido o todavía no fue configurado en AWS.",
    face_collection_not_configured: "La colección de Rekognition todavía no está configurada.",
    invalid_image: "Usá una imagen JPG o PNG válida.",
    image_too_large: "La imagen supera los 5 MB. Probá una versión más pequeña.",
    face_quality_insufficient: "Rekognition no pudo registrar ese rostro. Probá una foto más clara.",
    single_face_required: "El recorte debe contener exactamente un rostro. Probá otra foto.",
    face_association_rejected: "Rekognition no pudo confirmar que ese rostro corresponda al perfil elegido.",
    consented_profile_not_found: "El perfil no existe o no tiene consentimiento registrado.",
    face_consent_required: "La persona no tiene consentimiento facial registrado.",
    profile_name_required: "Ingresá el nombre de la persona."
  };
  return labels[error.message] || error.message || "Ocurrió un error.";
}

async function withBusy(task) {
  if (state.busy) return;
  state.busy = true;
  document.body.classList.add("busy");
  try { await task(); } catch (error) { notice(friendlyError(error), "error"); }
  finally { state.busy = false; document.body.classList.remove("busy"); }
}

$("#login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  withBusy(async () => {
    state.apiBase = $("#api-url").value.trim().replace(/\/$/, "");
    state.token = $("#admin-token").value.trim();
    const session = await api("/admin/session");
    $("#environment").textContent = (tenantId || session.eventId).toUpperCase();
    $("#login-panel").hidden = true;
    $("#workspace").hidden = false;
    $("#logout").hidden = false;
    if (!session.faceCollectionConfigured) notice("La API está conectada, pero falta configurar la colección de Rekognition.", "error");
    await loadProfiles();
  });
});

$("#logout").addEventListener("click", () => {
  state.token = "";
  $("#admin-token").value = "";
  $("#workspace").hidden = true;
  $("#login-panel").hidden = false;
  $("#logout").hidden = true;
  $("#environment").textContent = "SIN CONEXIÓN";
});

async function loadProfiles() {
  const result = await api("/admin/profiles");
  state.profiles = result.profiles.filter((profile) => profile.consent === true).sort((a, b) => a.name.localeCompare(b.name, "es"));
  renderProfiles();
  renderFaces();
}

function renderProfiles() {
  const list = $("#profile-list");
  if (!state.profiles.length) {
    list.innerHTML = `<p class="inline-empty">Todavía no hay perfiles reales. Creá el primero en el formulario.</p>`;
    return;
  }
  list.innerHTML = state.profiles.map((profile) => `<button class="profile-row ${state.selectedProfileId === profile.id ? "selected" : ""}" type="button" data-profile="${escapeHtml(profile.id)}"><span class="profile-avatar" style="--avatar:${/^#[0-9a-f]{6}$/i.test(profile.color) ? profile.color : "#c8ff3d"}">${escapeHtml(profile.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase())}</span><span><strong>${escapeHtml(profile.name)}</strong><small>${escapeHtml(profile.role)} · ${profile.faceConsent ? "Rostro habilitado" : "Sin consentimiento facial"}</small></span><span class="row-arrow">↗</span></button>`).join("");
  list.querySelectorAll("[data-profile]").forEach((button) => button.addEventListener("click", () => withBusy(() => selectProfile(button.dataset.profile))));
}

async function selectProfile(profileId) {
  state.selectedProfileId = profileId;
  renderProfiles();
  const data = await api(`/admin/profiles/${encodeURIComponent(profileId)}/faces`);
  const profile = state.profiles.find((item) => item.id === profileId);
  $("#face-registry").innerHTML = `<div class="registry-heading"><strong>${escapeHtml(profile?.name || profileId)}</strong><span>${data.faces.length} ${data.faces.length === 1 ? "rostro registrado" : "rostros registrados"}</span></div>${profile?.role === "hero" ? `<div class="consent-toolbar"><span>Compartir ubicación</span><button type="button" id="hero-link-button">Crear enlace privado</button></div><div id="hero-link-result" hidden></div>` : ""}<div class="consent-toolbar"><span>${profile?.faceConsent ? "Consentimiento facial registrado" : "Sin consentimiento facial"}</span><button type="button" id="face-consent-toggle">${profile?.faceConsent ? "Retirar consentimiento" : "Registrar consentimiento"}</button></div>${data.faces.length ? data.faces.map((face) => `<div class="registry-row"><span>Face ID ${escapeHtml(face.faceId.slice(0, 8))}… <small>${escapeHtml(new Date(face.createdAt).toLocaleDateString("es-AR"))}</small></span><button type="button" data-delete-face="${escapeHtml(face.faceId)}" aria-label="Eliminar rostro">Eliminar</button></div>`).join("") : `<p class="inline-empty">Todavía no tiene rostros registrados.</p>`}`;
  $("#hero-link-button")?.addEventListener("click", () => withBusy(async () => {
    if (!window.confirm("¿Crear un enlace privado? El enlace anterior dejará de funcionar y se detendrá la ubicación actual.")) return;
    const result = await api(`/admin/heroes/${encodeURIComponent(profileId)}/link`, { method: "POST" });
    const container = $("#hero-link-result");
    container.hidden = false;
    container.innerHTML = `<p>Copiá este enlace y envialo solo a ${escapeHtml(profile.name)}. No volverá a mostrarse.</p><input aria-label="Enlace privado del héroe" readonly />`;
    container.querySelector("input").value = result.url;
    container.querySelector("input").select();
  }));
  $("#face-consent-toggle").addEventListener("click", () => updateFaceConsent(profileId, !profile?.faceConsent));
  $("#face-registry").querySelectorAll("[data-delete-face]").forEach((button) => button.addEventListener("click", () => deleteFace(profileId, button.dataset.deleteFace)));
}

async function updateFaceConsent(profileId, enabled) {
  const message = enabled ? "¿Confirmás que esta persona aceptó el reconocimiento facial?" : "¿Retirar el consentimiento y eliminar todos sus rostros de Rekognition?";
  if (!window.confirm(message)) return;
  await withBusy(async () => {
    await api(`/admin/profiles/${encodeURIComponent(profileId)}/face-consent`, { method: "PUT", body: JSON.stringify({ faceConsent: enabled }) });
    await loadProfiles();
    await selectProfile(profileId);
    notice(enabled ? "Consentimiento facial registrado." : "Consentimiento retirado y rostros eliminados.", "success");
  });
}

async function deleteFace(profileId, faceId) {
  if (!window.confirm("¿Eliminar este rostro de Rekognition?")) return;
  await withBusy(async () => {
    await api(`/admin/profiles/${encodeURIComponent(profileId)}/faces/${encodeURIComponent(faceId)}`, { method: "DELETE" });
    notice("Rostro eliminado de la colección.", "success");
    await selectProfile(profileId);
  });
}

$("#refresh-profiles").addEventListener("click", () => withBusy(loadProfiles));
$("#profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  withBusy(async () => {
    const form = new FormData(event.target);
    await api("/admin/profiles", { method: "POST", body: JSON.stringify({
      ...(form.get("countryCode") ? { countryCode: form.get("countryCode") } : {}), name: form.get("name"), role: form.get("role"), title: form.get("title"), city: form.get("city"), community: form.get("community"), consent: form.get("consent") === "on", faceConsent: form.get("faceConsent") === "on"
    }) });
    event.target.reset();
    await loadProfiles();
    notice("Perfil creado. Ya podés etiquetarlo en una foto.", "success");
  });
});

function loadPhoto(file) {
  if (!file || !["image/jpeg", "image/png"].includes(file.type)) { notice("Elegí una imagen JPG o PNG.", "error"); return; }
  withBusy(async () => {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      state.image = canvas.toDataURL("image/jpeg", 0.85);
      state.faces = [];
      state.labels.clear();
      state.saved.clear();
      $("#photo-preview").src = state.image;
      $("#photo-stage").hidden = false;
      await $("#photo-preview").decode();
      fitPhotoPreview();
      $("#detect-button").disabled = false;
      $("#photo-info").textContent = `${file.name} · ${canvas.width} × ${canvas.height}`;
      renderFaces();
    } finally { URL.revokeObjectURL(url); }
  });
}

function fitPhotoPreview() {
  const image = $("#photo-preview");
  if (!state.image || !image.naturalWidth) return;
  const availableWidth = $("#photo-stage").clientWidth;
  const ratio = Math.min(1, availableWidth / image.naturalWidth, 440 / image.naturalHeight);
  const frame = $(".photo-canvas");
  frame.style.width = `${Math.round(image.naturalWidth * ratio)}px`;
  frame.style.height = `${Math.round(image.naturalHeight * ratio)}px`;
}

window.addEventListener("resize", fitPhotoPreview);

$("#photo-input").addEventListener("change", (event) => loadPhoto(event.target.files?.[0]));
$("#dropzone").addEventListener("dragover", (event) => { event.preventDefault(); event.currentTarget.classList.add("dragging"); });
$("#dropzone").addEventListener("dragleave", (event) => event.currentTarget.classList.remove("dragging"));
$("#dropzone").addEventListener("drop", (event) => { event.preventDefault(); event.currentTarget.classList.remove("dragging"); loadPhoto(event.dataTransfer.files?.[0]); });

$("#detect-button").addEventListener("click", () => withBusy(async () => {
  const result = await api("/admin/detect-faces", { method: "POST", body: JSON.stringify({ imageBase64: state.image }) });
  state.faces = result.faces.filter((face) => face.box);
  state.labels.clear();
  state.saved.clear();
  renderFaces();
  notice(state.faces.length ? `${state.faces.length} ${state.faces.length === 1 ? "rostro detectado" : "rostros detectados"}. Revisá cada recuadro.` : "No se detectaron rostros. Probá otra foto.", state.faces.length ? "success" : "info");
}));

function renderFaces() {
  $("#face-count").textContent = `${state.faces.length} ${state.faces.length === 1 ? "ROSTRO" : "ROSTROS"}`;
  $("#face-boxes").innerHTML = state.faces.map((face) => `<button class="face-box ${state.saved.has(face.id) ? "is-saved" : ""}" type="button" data-face-box="${face.id}" style="left:${Math.max(0, face.box.Left * 100)}%;top:${Math.max(0, face.box.Top * 100)}%;width:${Math.min(100, face.box.Width * 100)}%;height:${Math.min(100, face.box.Height * 100)}%"><span>${face.id + 1}</span></button>`).join("");
  $("#face-boxes").querySelectorAll("[data-face-box]").forEach((button) => button.addEventListener("click", () => $("#face-row-" + button.dataset.faceBox)?.scrollIntoView({ behavior: "smooth", block: "center" })));
  if (!state.faces.length) {
    $("#face-list").className = "empty-state";
    $("#face-list").innerHTML = `<span>⌗</span><h4>Las personas aparecen acá</h4><p>Después de detectar las caras, asigná un perfil a cada una. Las que no etiquetes se ignoran.</p>`;
    $("#save-faces").disabled = true;
    return;
  }
  $("#face-list").className = "face-list";
  $("#face-list").innerHTML = state.faces.map((face) => `<div class="face-row" id="face-row-${face.id}"><span class="face-index">${face.id + 1}</span><div class="face-select"><strong>Rostro ${face.id + 1} ${state.saved.has(face.id) ? "· Registrado ✓" : ""}</strong><small>${Math.round(face.confidence || 0)}% detección · nitidez ${Math.round(face.sharpness || 0)}</small><select data-face-select="${face.id}" ${state.saved.has(face.id) ? "disabled" : ""}><option value="">Ignorar este rostro</option>${state.profiles.filter((profile) => profile.faceConsent).map((profile) => `<option value="${escapeHtml(profile.id)}" ${state.labels.get(face.id) === profile.id ? "selected" : ""}>${escapeHtml(profile.name)}</option>`).join("")}</select></div><button class="face-search" type="button" data-face-search="${face.id}" title="Probar reconocimiento" aria-label="Probar reconocimiento del rostro ${face.id + 1}">⌕</button><div class="match-result" id="match-result-${face.id}"></div></div>`).join("");
  $("#face-list").querySelectorAll("[data-face-select]").forEach((select) => select.addEventListener("change", () => { state.labels.set(Number(select.dataset.faceSelect), select.value); updateSaveButton(); }));
  $("#face-list").querySelectorAll("[data-face-search]").forEach((button) => button.addEventListener("click", () => searchFace(Number(button.dataset.faceSearch))));
  updateSaveButton();
}

function updateSaveButton() {
  $("#save-faces").disabled = !state.faces.some((face) => state.labels.get(face.id) && !state.saved.has(face.id));
}

async function cropFace(face) {
  const image = new Image();
  image.src = state.image;
  await image.decode();
  const box = face.box;
  const padding = Math.max(box.Width * image.naturalWidth, box.Height * image.naturalHeight) * 0.3;
  const left = Math.max(0, box.Left * image.naturalWidth - padding);
  const top = Math.max(0, box.Top * image.naturalHeight - padding);
  const right = Math.min(image.naturalWidth, (box.Left + box.Width) * image.naturalWidth + padding);
  const bottom = Math.min(image.naturalHeight, (box.Top + box.Height) * image.naturalHeight + padding);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(right - left));
  canvas.height = Math.max(1, Math.round(bottom - top));
  canvas.getContext("2d").drawImage(image, left, top, right - left, bottom - top, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

$("#save-faces").addEventListener("click", () => withBusy(async () => {
  const selected = state.faces.filter((face) => state.labels.get(face.id) && !state.saved.has(face.id));
  let savedCount = 0;
  for (const face of selected) {
    try {
      await api("/admin/faces", { method: "POST", body: JSON.stringify({ profileId: state.labels.get(face.id), imageBase64: await cropFace(face) }) });
      state.saved.add(face.id);
      savedCount++;
    } catch (error) {
      notice(`Rostro ${face.id + 1}: ${friendlyError(error)}`, "error");
    }
  }
  renderFaces();
  if (savedCount) notice(`${savedCount} ${savedCount === 1 ? "rostro registrado" : "rostros registrados"} en Rekognition.`, "success");
  if (state.selectedProfileId) await selectProfile(state.selectedProfileId);
}));

async function searchFace(faceId) {
  await withBusy(async () => {
    const face = state.faces.find((item) => item.id === faceId);
    const result = await api("/admin/search-faces", { method: "POST", body: JSON.stringify({ imageBase64: await cropFace(face) }) });
    const element = $(`#match-result-${faceId}`);
    element.innerHTML = result.matches.length ? result.matches.map((match) => `<span>${escapeHtml(match.name)} · ${Math.round(match.similarity)}%</span>`).join("") : `<span>Sin coincidencias</span>`;
  });
}
