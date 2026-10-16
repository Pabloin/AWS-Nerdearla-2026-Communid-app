import { tenantId, tenantStorageKey, tenantApiBase, tenantProfileUrl } from "../../shared/tenant";
import React, { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import ReactDOM from "react-dom/client";
import {
  ArrowLeft,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  Compass,
  Gift,
  ImagePlus,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  QrCode,
  ScanLine,
  Sparkles,
  Trophy,
  Users,
  UserRound,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { demoProfiles, demoQuests } from "./demo-data";
import { heroPhotoUrl } from "./heroPhotos";
import { AuthScreen } from "./AuthScreen";
import {
  accessToken,
  authEnabled,
  currentSession,
  logout,
  updateAttendeeProfile,
  type AttendeeSession,
} from "./auth";
import {
  createGuest,
  listGuestEncounters,
  readGuestSession,
  recordGuestEncounter,
  refreshGuest,
  removeGuestContact,
  saveGuestSession,
  setGuestContact,
  updateGuestProfile,
  type GuestSession,
} from "./guest";
import {
  collectEncounter,
  profileIdFromQr,
  questProgress,
  roleLabels,
  type BuilderProfile,
  type Encounter,
} from "./domain";
import { nativeAndroid, nativeBadgeUrl, scanNativeBadge, takeNativeSelfie } from "./native";
import "./styles.css";

type View =
  | "welcome"
  | "guest-entry"
  | "login"
  | "discover"
  | "profile"
  | "scan"
  | "selfie"
  | "success"
  | "passport";
const encounterKey = tenantStorageKey("comunid:encounters");
const apiBaseUrl = tenantApiBase(import.meta.env.VITE_API_BASE_URL);
type LiveHero = { profileId: string; name: string; latitude: number; longitude: number; accuracy: number; updatedAt: string };
const featuredHeroProfiles: BuilderProfile[] = [
  { id: "matias-kreder", name: "Matias Kreder", role: "hero", title: "AWS Hero", city: "", community: "", superpower: "", askMeAbout: "", story: "", color: "#C8FF3D" },
  { id: "rossana-suarez", name: "Rossana Suarez (Roxs)", role: "hero", title: "AWS Hero", city: "", community: "", superpower: "", askMeAbout: "", story: "", color: "#C8FF3D" },
  { id: "ricardo-ceci", name: "Ricardo Ceci", role: "hero", title: "AWS Hero", city: "", community: "", superpower: "", askMeAbout: "", story: "", color: "#C8FF3D" },
  { id: "damian-olguin", name: "Damian Olguin", role: "hero", title: "AWS Hero", city: "", community: "", superpower: "", askMeAbout: "", story: "", color: "#C8FF3D" },
];
function heroMapUrl(hero: LiveHero): string {
  const { latitude, longitude } = hero;
  const latitudeSpan = 0.0025;
  const longitudeSpan = latitudeSpan / Math.max(Math.cos(latitude * Math.PI / 180), 0.2);
  const query = new URLSearchParams({
    bbox: [longitude - longitudeSpan, latitude - latitudeSpan, longitude + longitudeSpan, latitude + latitudeSpan].join(","),
    layer: "mapnik",
    marker: `${latitude},${longitude}`,
  });
  return `https://www.openstreetmap.org/export/embed.html?${query}`;
}
function readEncounters(): Encounter[] {
  try {
    const value = JSON.parse(localStorage.getItem(encounterKey) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
function Avatar({
  profile,
  large = false,
}: {
  profile: BuilderProfile;
  large?: boolean;
}) {
  const photoUrl = (!tenantId ? heroPhotoUrl(profile.id) : null) || (profile.id.startsWith("member-") ? apiBaseUrl + "/profiles/" + profile.id + "/photo" : null);
  return (
    <span
      className={`avatar ${large ? "avatar-large" : ""} ${photoUrl ? "avatar-photo" : ""} ${photoUrl ? `avatar-${profile.id}` : ""}`}
      style={{ "--accent": profile.color } as React.CSSProperties}
    >
      {photoUrl ? <img src={photoUrl} alt="" loading="lazy" /> : profile.name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}
function Brand() {
  return (
    <span className="brand-wrap" aria-label="comunid.app">
      <span className="brand-icon">
        <img src="/brand/logo-comunid-app.png" alt="" />
      </span>
      <span className="brand-word">
        comunid<span>.app</span>
      </span>
    </span>
  );
}

function App() {
  const [eventName, setEventName] = useState(import.meta.env.VITE_EVENT_NAME || tenantId || "Nerdearla 2026");
  useEffect(() => {
    if (!tenantId || !apiBaseUrl) return;
    let active = true;
    fetch(`${apiBaseUrl}/health`).then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => { if (active && data.tenant?.name) setEventName(data.tenant.name); if (active && data.eventId) setEventId(data.eventId); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  const [eventId, setEventId] = useState(import.meta.env.VITE_EVENT_ID || "nerdearla-2026");
  const [view, setView] = useState<View>("welcome");
  const [nativeLink, setNativeLink] = useState<{ url: string } | null>(null);
  const [restoredPhoto, setRestoredPhoto] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<AttendeeSession | null>(null);
  const [guest, setGuest] = useState<GuestSession | null>(readGuestSession);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [guestBusy, setGuestBusy] = useState(false);
  const [guestError, setGuestError] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactConsent, setContactConsent] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactMessage, setContactMessage] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [profiles, setProfiles] = useState<BuilderProfile[]>(tenantId ? [] : demoProfiles);
  const [liveHeroes, setLiveHeroes] = useState<LiveHero[]>([]);
  const [mapHeroId, setMapHeroId] = useState<string | null>(null);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [mapDismissed, setMapDismissed] = useState(false);
  const mapHero = liveHeroes.find((hero) => hero.profileId === mapHeroId);
  useEffect(() => {
    if (communityOpen && !mapDismissed && !mapHeroId && liveHeroes.length > 0) {
      setMapHeroId(liveHeroes[0].profileId);
    }
  }, [communityOpen, liveHeroes, mapDismissed, mapHeroId]);
  const [encounters, setEncounters] = useState<Encounter[]>(() =>
    apiBaseUrl ? [] : readEncounters(),
  );
  const [pending, setPending] = useState<BuilderProfile | null>(null);
  const [selected, setSelected] = useState<BuilderProfile | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const deepLinkHandled = useRef(false);
  const collectedIds = useMemo(
    () => new Set(encounters.map((item) => item.builderId)),
    [encounters],
  );
  const collectedProfiles = profiles.filter((profile) =>
    collectedIds.has(profile.id),
  );
  const heroEncounters = collectedProfiles.filter((profile) => profile.role === "hero").length;
  const builderEncounters = collectedProfiles.filter((profile) => profile.role === "builder").length;
  const studentEncounters = collectedProfiles.filter((profile) => profile.role === "student").length;
  const userGroupBadgeEarned = collectedProfiles.length >= 3;
  const rewardUnlocked =
    collectedProfiles.length >= 5 &&
    heroEncounters >= 2 &&
    builderEncounters >= 1 &&
    userGroupBadgeEarned &&
    studentEncounters >= 1;
  useEffect(() => {
    setContactEmail(guest?.guest.email ?? "");
  }, [guest?.guest.email]);
  useEffect(() => {
    setProfileName(session?.name || guest?.guest.name || "");
    setProfileEmail(session?.email || guest?.guest.email || "");
  }, [session, guest?.guest.name, guest?.guest.email]);
  useEffect(() => {
    if (!apiBaseUrl)
      localStorage.setItem(encounterKey, JSON.stringify(encounters));
  }, [encounters]);
  useEffect(() => {
    let active = true;
    currentSession()
      .then(async (current) => {
        if (!active) return;
        setSession(current);
        if (current) {
          setView("discover");
        } else {
          const storedGuest = readGuestSession();
          if (storedGuest) {
            try {
              const verifiedGuest = await refreshGuest(storedGuest, apiBaseUrl);
              if (!active) return;
              setGuest(verifiedGuest);
              saveGuestSession(verifiedGuest);
              setView("discover");
            } catch {
              if (!active) return;
              setGuest(null);
              saveGuestSession(null);
              setAuthMessage("Tu acceso de invitado venció. Creá uno nuevo para continuar.");
              setView("welcome");
            }
          } else {
            setView("welcome");
          }
        }
        if (active) setAuthReady(true);
      })
      .catch(() => {
        if (active) {
          setAuthMessage("No pudimos verificar tu sesión.");
          setAuthReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if ((!session && !guest) || !apiBaseUrl) return;
    let active = true;
    const load = session
      ? accessToken().then((token) =>
          fetch(`${apiBaseUrl}/me/encounters`, {
            headers: { authorization: `Bearer ${token}` },
          }).then((response) =>
            response.ok
              ? response.json()
              : Promise.reject(new Error("No pudimos cargar tu pasaporte.")),
          ),
        )
      : listGuestEncounters(guest!, apiBaseUrl);
    load
      .then((data) => {
        if (!active) return;
        setEncounters(
          Array.isArray(data.encounters)
            ? data.encounters.map(
                (item: {
                  profileId: string;
                  collectedAt: string;
                  eventId: string;
                }) => ({
                  builderId: item.profileId,
                  collectedAt: item.collectedAt,
                  eventId: item.eventId,
                }),
              )
            : [],
        );
      })
      .catch(() => {
        if (active)
          setAuthMessage(
            "No pudimos cargar tu pasaporte. Recargá la página para volver a intentar.",
          );
      });
    return () => { active = false; };
  }, [session, guest?.token]);
  useEffect(() => {
    if (!apiBaseUrl) return;
    let active = true;
    const refresh = () => fetch(apiBaseUrl + "/profiles")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (active && Array.isArray(data.profiles))
          setProfiles(data.profiles);
      })
      .catch(() => undefined);
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!apiBaseUrl) return;
    let active = true;
    const refresh = () => fetch(`${apiBaseUrl}/community/live`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => { if (active) setLiveHeroes(Array.isArray(data.people) ? data.people : []); })
      .catch(() => { if (active) setLiveHeroes([]); });
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (deepLinkHandled.current || (!session && !guest)) return;
    const id = profileIdFromQr(nativeLink?.url || window.location.href, tenantId);
    const profile = profiles.find((item) => item.id === id);
    if (profile) {
      deepLinkHandled.current = true;
      setPending(profile);
      setView("selfie");
    }
  }, [profiles, session, guest, nativeLink]);
  useEffect(() => {
    if (!nativeAndroid) return;
    let active = true;
    const listeners: Array<{ remove: () => Promise<void> }> = [];
    const keep = async (listener: Promise<{ remove: () => Promise<void> }>) => {
      const handle = await listener;
      if (active) listeners.push(handle); else await handle.remove();
    };
    void import("@capacitor/app").then(async ({ App: NativeApp }) => {
      const receive = (url: string) => {
        const badge = nativeBadgeUrl(url);
        if (!active || !badge || !profileIdFromQr(badge, tenantId)) return;
        deepLinkHandled.current = false;
        setNativeLink({ url: badge });
      };
      await keep(NativeApp.addListener("appUrlOpen", ({ url }) => receive(url)));
      await keep(NativeApp.addListener("appRestoredResult", (result) => {
        if (active && result.pluginId === "Camera" && result.success && typeof result.data?.webPath === "string") setRestoredPhoto(result.data.webPath);
      }));
      const launch = await NativeApp.getLaunchUrl();
      if (launch) receive(launch.url);
    }).catch(() => { if (active) setMessage("No pudimos abrir el enlace. Podés escanear el QR desde la app."); });
    return () => { active = false; listeners.forEach((handle) => { void handle.remove(); }); };
  }, []);
  useEffect(() => {
    if (!restoredPhoto || (!session && !guest)) return;
    let saved: { profileId?: string; owner?: string };
    try { saved = JSON.parse(localStorage.getItem(tenantStorageKey("comunid:pending-camera-profile")) || "{}"); } catch { return; }
    if (saved.owner !== (guest?.guest.id || session?.userId)) { setRestoredPhoto(null); return; }
    const profile = profiles.find((item) => item.id === saved.profileId);
    if (!profile) return;
    setPending(profile); setSelfie(restoredPhoto); setView("selfie"); setRestoredPhoto(null);
  }, [restoredPhoto, profiles, session, guest]);
  useEffect(() => {
    if (!nativeAndroid) return;
    let active = true;
    let handle: { remove: () => Promise<void> } | undefined;
    void import("@capacitor/app").then(async ({ App: NativeApp }) => {
      const listener = await NativeApp.addListener("backButton", () => {
        if (["welcome", "discover"].includes(view)) void NativeApp.minimizeApp();
        else go(view === "selfie" ? "scan" : view === "guest-entry" ? "welcome" : "discover");
      });
      if (active) handle = listener; else await listener.remove();
    });
    return () => { active = false; void handle?.remove(); };
  }, [view, session, guest]);
  function stopCamera() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    frameRef.current = null;
    streamRef.current = null;
    setCameraOpen(false);
  }
  useEffect(() => stopCamera, []);
  function go(next: View) {
    stopCamera();
    setMessage("");
    setView(
      !session && !guest && !["welcome", "login", "guest-entry"].includes(next)
        ? "guest-entry"
        : next,
    );
    window.scrollTo(0, 0);
  }
  function start() {
    if (guest) go("discover");
    else go("guest-entry");
  }
  async function beginAsGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGuestBusy(true);
    setGuestError("");
    try {
      if (authEnabled && !apiBaseUrl) throw new Error("La API no está configurada.");
      const created = await createGuest(guestName, guestEmail, apiBaseUrl);
      saveGuestSession(created);
      setGuest(created);
      setSession(null);
      setEncounters([]);
      setContactEmail("");
      setContactConsent(false);
      setView("discover");
      window.scrollTo(0, 0);
    } catch (error) {
      setGuestError(
        error instanceof Error && !error.message.startsWith("guest_api_")
          ? error.message
          : "No pudimos crear tu pasaporte. Intentá de nuevo.",
      );
    } finally {
      setGuestBusy(false);
    }
  }
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!guest && !session) return;
    setProfileBusy(true);
    setProfileMessage("");
    try {
      if (guest) {
        const updated = await updateGuestProfile(guest, apiBaseUrl, profileName, profileEmail);
        saveGuestSession(updated);
        setGuest(updated);
        setProfileName(updated.guest.name);
        setProfileEmail(updated.guest.email || "");
        setProfileMessage("Perfil actualizado.");
      } else {
        await updateAttendeeProfile(profileName, profileEmail);
        const current = await currentSession();
        if (current) setSession(current);
        setProfileMessage("Nombre actualizado. Si cambiaste el correo, Cognito puede pedirte que lo confirmes antes de usarlo para iniciar sesión.");
      }
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "No pudimos guardar los cambios.");
    } finally { setProfileBusy(false); }
  }
  async function authenticated() {
    const current = await currentSession();
    if (!current) {
      setAuthMessage("No pudimos iniciar tu sesión.");
      return;
    }
    setAuthMessage("");
    setSession(current);
    setEncounters([]);
    setView("discover");
    window.scrollTo(0, 0);
  }
  async function endSession() {
    localStorage.removeItem(tenantStorageKey("comunid:pending-camera-profile"));
    setRestoredPhoto(null);
    try {
      if (session) await logout();
      if (guest) saveGuestSession(null);
      setSession(null);
      setGuest(null);
      setEncounters([]);
      setView("welcome");
    } catch {
      setAuthMessage("No pudimos cerrar la sesión. Intentá de nuevo.");
    }
  }
  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!guest || !rewardUnlocked || !contactConsent) return;
    setContactBusy(true);
    setContactMessage("");
    try {
      const updated = await setGuestContact(guest, apiBaseUrl, contactEmail);
      saveGuestSession(updated);
      setGuest(updated);
      setContactMessage("Listo. Guardamos tu correo para novedades de la comunidad.");
    } catch {
      setContactMessage("No pudimos guardar tu correo. Intentá de nuevo.");
    } finally {
      setContactBusy(false);
    }
  }
  async function withdrawContact() {
    if (!guest) return;
    setContactBusy(true);
    setContactMessage("");
    try {
      const updated = await removeGuestContact(guest, apiBaseUrl);
      saveGuestSession(updated);
      setGuest(updated);
      setContactConsent(false);
      setContactMessage("Quitamos tu correo. Tu pasaporte sigue disponible.");
    } catch {
      setContactMessage("No pudimos quitar tu correo. Intentá de nuevo.");
    } finally {
      setContactBusy(false);
    }
  }
  function badgeFound(payload: string) {
    const id = profileIdFromQr(nativeAndroid ? nativeBadgeUrl(payload) || "" : payload, tenantId);
    const profile = profiles.find((item) => item.id === id);
    if (!profile) throw new Error("Este badge no pertenece al evento actual.");
    stopCamera();
    setPending(profile);
    setSelfie(null);
    go("selfie");
  }
  function readFrame() {
    const video = videoRef.current,
      canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;
    if (
      video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA &&
      video.videoWidth
    ) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, {
          inversionAttempts: "attemptBoth",
        });
        if (code?.data) {
          try {
            badgeFound(code.data);
            return;
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "No pudimos leer el QR.",
            );
          }
        }
      }
    }
    frameRef.current = requestAnimationFrame(readFrame);
  }
  async function openCamera(mode: "scan" | "selfie") {
    setMessage("Abriendo cámara…");
    try {
      if (nativeAndroid) {
        if (mode === "scan") {
          const badge = await scanNativeBadge();
          if (badge) badgeFound(badge); else setMessage("Escaneo cancelado. Podés volver a intentarlo.");
        } else {
          if (pending) localStorage.setItem(tenantStorageKey("comunid:pending-camera-profile"), JSON.stringify({ profileId: pending.id, owner: guest?.guest.id || session?.userId }));
          setSelfie(await takeNativeSelfie());
          setMessage("");
        }
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode === "scan" ? "environment" : "user" },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(async () => {
        if (!videoRef.current || streamRef.current !== stream) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setMessage(
          mode === "scan"
            ? "Mantené el badge dentro del recuadro."
            : "Ubíquense los dos dentro del marco.",
        );
        if (mode === "scan")
          frameRef.current = requestAnimationFrame(readFrame);
      });
    } catch {
      setMessage(
        "No se pudo completar la captura. Revisá el permiso de cámara o volvé a intentarlo.",
      );
    }
  }
  function captureSelfie() {
    const video = videoRef.current,
      canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setSelfie(canvas.toDataURL("image/jpeg", 0.82));
    stopCamera();
  }
  async function finishEncounter() {
    if (!pending) return;
    try {
      if (session && authEnabled) {
        if (!apiBaseUrl) throw new Error("La API no está configurada.");
        const token = await accessToken();
        const response = await fetch(`${apiBaseUrl}/encounters`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ profileId: pending.id }),
        });
        if (!response.ok)
          throw new Error(
            "Encontramos el badge, pero no pudimos guardar el encuentro. Probá de nuevo.",
          );
      } else if (guest && apiBaseUrl) {
        await recordGuestEncounter(guest, apiBaseUrl, pending.id);
      }
      localStorage.removeItem(tenantStorageKey("comunid:pending-camera-profile"));
      setEncounters((current) => collectEncounter(current, pending.id, eventId));
      go("success");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el encuentro.",
      );
    }
  }
  const inApp = !["welcome", "login", "guest-entry"].includes(view);
  if (!authReady)
    return (
      <div className="app-shell auth-loading" role="status">
        Cargando tu pasaporte…
      </div>
    );
  return (
    <div className="app-shell">
      {view === "welcome" && (
        <main className="intro-screen">
          <div className="intro-top">
            <Brand />
            <span className="event-pill">
              <MapPin size={14} /> {eventName}
            </span>
          </div>
          <div className="intro-art" aria-hidden="true">
            <div className="art-orbit" />
            <div className="art-book">
              <div className="art-page">
                <span className="art-logo">
                  ✦<br />
                  ●●●
                </span>
                <small>comunid.app</small>
                <i>PASAPORTE DE ENCUENTROS</i>
              </div>
              <div className="art-page art-stamps">
                <span>
                  ✦<br />
                  HERO
                </span>
                <span>
                  ✧<br />
                  BUILDER
                </span>
                <span>
                  ✦<br />
                  COMMUNITY
                </span>
                <span>＋</span>
              </div>
            </div>
          </div>
          <div className="intro-copy">
            <h1>
              Tu comunidad,
              <br />
              <em>una aventura.</em>
            </h1>
            <p>Conocé personas, guardá encuentros y completá tu pasaporte.</p>
            <button className="primary-button" type="button" onClick={start}>
              Empezar <ChevronRight size={20} />
            </button>
            {authEnabled && (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  go("login");
                }}
              >
                Ya tengo cuenta <ChevronRight size={17} />
              </button>
            )}
          </div>
        </main>
      )}
      {view === "guest-entry" && (
        <main className="login-screen guest-entry-screen">
          <button
            className="icon-button login-back"
            type="button"
            onClick={() => go("welcome")}
            aria-label="Volver"
          >
            <ArrowLeft size={22} />
          </button>
          <Brand />
          <div className="guest-entry-art" aria-hidden="true">
            <div className="guest-entry-orbit" />
            <span className="guest-entry-emblem">
              <Users size={56} />
              <Sparkles size={20} />
            </span>
          </div>
          <div className="login-hero guest-entry-copy">
            <span className="eyebrow">TU PASAPORTE EMPIEZA ACÁ</span>
            <h1>
              Entrá como <em>invitado</em>
            </h1>
            <p>Decinos cómo te llamás y salí a conocer gente. Sin correo ni contraseña.</p>
          </div>
          <form onSubmit={(event) => void beginAsGuest(event)}>
            <label htmlFor="guest-name">Tu nombre</label>
            <div className="input-wrap">
              <Users size={20} />
              <input
                id="guest-name"
                type="text"
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                placeholder="¿Cómo te llamás?"
                autoComplete="given-name"
                minLength={2}
                maxLength={60}
                required
                disabled={guestBusy}
              />
            </div>
            <label htmlFor="guest-email">Tu correo electrónico</label>
            <div className="input-wrap">
              <Mail size={20} />
              <input id="guest-email" type="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} placeholder="tu@email.com" autoComplete="email" required disabled={guestBusy} />
            </div>
            <p className="guest-entry-note">
              Revisá que el correo esté bien escrito: lo usaremos para compartirte el premio cuando completes el pasaporte. Podés editarlo después desde Mi perfil.
            </p>
            {guestError && <p className="auth-error" role="alert">{guestError}</p>}
            <button className="primary-button" type="submit" disabled={guestBusy}>
              {guestBusy ? "Creando pasaporte…" : "Empezar a explorar"}
              <ChevronRight size={20} />
            </button>
          </form>
          {authEnabled && (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setAuthMode("login");
                go("login");
              }}
            >
              Ya tengo una cuenta <ChevronRight size={17} />
            </button>
          )}
        </main>
      )}
      {view === "login" &&
        (authEnabled ? (
          <AuthScreen
            key={authMode}
            brand={<Brand />}
            initialMode={authMode}
            onBack={() => go("welcome")}
            onAuthenticated={() => void authenticated()}
          />
        ) : (
          <main className="login-screen">
            <button
              className="icon-button login-back"
              type="button"
              onClick={() => go("welcome")}
              aria-label="Volver"
            >
              <ArrowLeft size={22} />
            </button>
            <Brand />
            <div className="login-hero">
              <span className="login-mark">
                ✦<br />
                ●●●
              </span>
              <h1>
                Volvé a tu
                <br />
                <em>comunidad</em>
              </h1>
              <p>Ingresá para continuar tu pasaporte.</p>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (email.trim()) start();
              }}
            >
              <label htmlFor="login-email">Correo electrónico</label>
              <div className="input-wrap">
                <Mail size={20} />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="tu@email.com"
                  required
                  autoComplete="email"
                />
              </div>
              <p className="demo-note">
                Vista de demo: tu progreso se guarda en este dispositivo.
              </p>
              <button className="primary-button" type="submit">
                Continuar en demo <ChevronRight size={20} />
              </button>
            </form>
            <button className="text-button" type="button" onClick={start}>
              Explorar sin correo <ChevronRight size={17} />
            </button>
          </main>
        ))}
      {authMessage && (
        <div className="global-message" role="alert">
          {authMessage}
        </div>
      )}
      {inApp && (
        <header
          className={`topbar ${view === "success" ? "topbar-light" : ""}`}
        >
          {view === "scan" || view === "selfie" ? (
            <button
              className="icon-button"
              type="button"
              onClick={() => go(view === "selfie" ? "scan" : "discover")}
              aria-label="Volver"
            >
              <ArrowLeft size={20} />
            </button>
          ) : null}
          <button
            className="brand-button"
            onClick={() => go("discover")}
            type="button"
          >
            <Brand />
          </button>
          {session || guest ? (
            <div className="topbar-actions">
              {view !== "profile" && <button className="profile-shortcut" type="button" onClick={() => go("profile")} aria-label="Abrir mi perfil"><UserRound size={19} /><span>Mi perfil</span></button>}
              <button className="topbar-disconnect" type="button" onClick={() => void endSession()} aria-label="Desconectar" title="Desconectar">
                <LogOut size={18} />
              </button>
            </div>
          ) : view === "scan" || view === "selfie" ? (
            <span className="icon-button top-action">
              <Camera size={20} />
            </span>
          ) : (
            <span className="event-pill">
              <MapPin size={13} /> {eventName}
            </span>
          )}
        </header>
      )}
      {view === "discover" && (
        <main className="page discover-page">
          <span className="eyebrow">{guest && !session ? `HOLA, ${guest.guest.name.toUpperCase()}` : eventName.toUpperCase()}</span>
          <h1>
            Explorá <em>el evento</em>
          </h1>
          <p className="page-subtitle">
            Conocé a los Heroes de la comunidad y mirá quiénes comparten su
            ubicación en vivo.
          </p>
          <section className="featured-heroes" aria-label="Heroes destacados">
            <h2>Conocé a los Heroes</h2>
            <p>{tenantId && !profiles.some((profile) => profile.role === "hero") ? "Todavía no hay Heroes publicados en esta comunidad." : "Elegí a uno para ver su perfil."}</p>
            <div className="featured-hero-list">
              {(tenantId ? profiles.filter((profile) => profile.role === "hero") : featuredHeroProfiles).map((featured) => {
                const profile = profiles.find((item) => item.id === featured.id) || featured;
                const photo = tenantId ? null : heroPhotoUrl(profile.id);
                return (
                  <button key={profile.id} className="featured-hero-card" type="button" onClick={() => setSelected(profile)}>
                    {photo ? <img src={photo} alt="" loading="lazy" /> : <Avatar profile={profile} />}
                    <span><strong>{profile.name}</strong><small>{profile.community || profile.title}</small></span>
                    <b>Ver perfil <ChevronRight size={16} /></b>
                  </button>
                );
              })}
            </div>
          </section>
          <button className="community-live-toggle" type="button" onClick={() => setCommunityOpen((open) => {
            const next = !open;
            if (next) setMapDismissed(false);
            return next;
          })} aria-expanded={communityOpen}>
            <Users size={19} /> Comunidad en vivo <span>{liveHeroes.length}</span><ChevronRight size={18} />
          </button>
          {communityOpen && <section className="live-heroes" aria-label="Personas compartiendo ubicación">
            <span className="eyebrow">COMPARTEN UBICACIÓN AHORA</span>
            <h2>Comunidad en vivo</h2>
            <p>Solo aparecen quienes activaron voluntariamente su ubicación. Puede variar dentro del edificio.</p>
            {liveHeroes.length === 0 ? <p className="community-empty">Todavía no hay personas compartiendo su ubicación.</p> : liveHeroes.map((hero) => {
              const profile = profiles.find((item) => item.id === hero.profileId);
              const photo = (!tenantId ? heroPhotoUrl(hero.profileId) : null) || (hero.profileId.startsWith("member-") ? apiBaseUrl + "/profiles/" + hero.profileId + "/photo" : null);
              return <button key={hero.profileId} className="live-hero" type="button" onClick={() => { setMapDismissed(false); setMapHeroId(hero.profileId); }} aria-expanded={mapHeroId === hero.profileId}>
                {photo ? <img className="live-hero-photo" src={photo} alt="" loading="lazy" /> : <span className="live-hero-pulse" aria-hidden="true" />}
                <span><strong>{hero.name}</strong><small>{profile?.community || profile?.title || "Hero"} · precisión ±{Math.round(hero.accuracy)} m · Ver mapa</small></span>
                <span aria-hidden="true">⌖</span>
              </button>;
            })}
            {mapHero && <div className="live-hero-map">
              <div className="live-hero-map-header"><strong>Ubicación de {mapHero.name}</strong><button type="button" onClick={() => { setMapHeroId(null); setMapDismissed(true); }} aria-label="Cerrar mapa"><X size={18} /></button></div>
              <iframe title={`Mapa de ${mapHero.name}`} src={heroMapUrl(mapHero)} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
              <small>Mapa: © OpenStreetMap contributors · La posición puede variar dentro del edificio.</small>
            </div>}
          </section>}
        </main>
      )}
      {view === "profile" && (
        <main className="page account-page">
          <span className="eyebrow">MI CUENTA</span>
          <h1>Mi perfil</h1>
          <p className="page-subtitle">Revisá tus datos. Usaremos tu correo para compartirte un premio cuando completes el pasaporte.</p>
          <form className="account-card" aria-label="Datos de tu perfil" onSubmit={(event) => void saveProfile(event)}>
            <span className="account-avatar"><UserRound size={28} /></span>
            <label htmlFor="profile-name">Nombre</label><input id="profile-name" className="profile-edit-input" value={profileName} onChange={(event) => setProfileName(event.target.value)} minLength={2} maxLength={60} required disabled={profileBusy} />
            <label htmlFor="profile-email">Correo electrónico</label><input id="profile-email" className="profile-edit-input" type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} maxLength={254} required disabled={profileBusy} />
            <p>Podés corregir estos datos en cualquier momento. El correo sirve para enviarte el premio al completar el pasaporte.</p>
            <button className="primary-button" type="submit" disabled={profileBusy}>{profileBusy ? "Guardando…" : "Guardar cambios"}</button>
            {profileMessage && <p role="status">{profileMessage}</p>}
          </form>
        </main>
      )}
      {view === "passport" && (
        <main className="page passport-page">
          <div className="page-center">
            <h1>Mi pasaporte</h1>
            <h2>{eventName}</h2>
            <p>Coleccioná encuentros. Conectá con la comunidad.</p>
          </div>
          <div className="passport-ticket">
            <div className="ticket-brand">
              <Brand />
              {guest && !session && (
                <small>
                  PARTICIPANTE INVITADO
                  <br />
                  <b>{guest.guest.name}</b>
                </small>
              )}
              <small>
                EVENTO
                <br />
                <b>{eventName}</b>
              </small>
              <small>
                AÑO
                <br />
                <b>2026</b>
              </small>
            </div>
            <span className="ticket-portrait">
              <Users size={54} />
            </span>
            <div className="ticket-progress">
              <strong>
                {Math.min(collectedProfiles.length, 5)} de 5 encuentros
              </strong>
              <div className="segments">
                {Array.from({ length: 5 }, (_, index) => (
                  <i
                    key={index}
                    className={index < collectedProfiles.length ? "filled" : ""}
                  />
                ))}
              </div>
            </div>
            <span className="ticket-stamp">
              COMUNIDAD
              <br />
              CONECTA
              <br />
              EXPLORA
            </span>
          </div>
          <div className="badge-grid">
            {(
              [
                { role: "hero", label: "Hero", count: heroEncounters, target: 2 },
                { role: "builder", label: "Builder", count: builderEncounters, target: 1 },
                { role: "community", label: "User Group", count: userGroupBadgeEarned ? 1 : 0, target: 1 },
                { role: "student", label: "Student", count: studentEncounters, target: 1 },
              ] as const
            ).map(({ role, label, count, target }) => {
              const found = count >= target;
              return (
                <div
                  className={found ? "badge-item earned" : "badge-item"}
                  key={role}
                >
                  <span className="hex-badge">
                    {found ? <Users size={30} /> : <LockKeyhole size={24} />}
                  </span>
                  <strong>
                    {label}
                  </strong>
                  <small>{Math.min(count, target)}/{target}</small>
                </div>
              );
            })}
          </div>
          <div className="reward-card">
            <Gift size={36} />
            <span>
              <small>{rewardUnlocked ? "PREMIO DESBLOQUEADO" : "PRÓXIMO PREMIO"}</small>
              <strong>
                {!rewardUnlocked
                  ? `${Math.min(collectedProfiles.length, 5)} de 5 encuentros`
                  : "¡Desbloqueado!"}
              </strong>
              <small>{rewardUnlocked ? "Completaste 2 Heroes, 1 Builder, User Group y 1 Student." : "Meta: 2 Heroes, 1 Builder, User Group y 1 Student."}</small>
            </span>
            <ChevronRight size={20} />
          </div>
          {guest && !session && rewardUnlocked && (
            <section className="guest-contact-card" aria-labelledby="guest-contact-title">
              <span className="eyebrow">SEGUÍ EN CONTACTO</span>
              <h2 id="guest-contact-title">La comunidad sigue después del evento.</h2>
              <p>Dejanos un correo correcto para poder compartirte el premio que desbloqueaste al completar el pasaporte. Podés corregirlo en Mi perfil.</p>
              {guest.guest.contactConsent && guest.guest.email ? (
                <div className="guest-contact-saved">
                  <span><Check size={18} /> {guest.guest.email}</span>
                  <button type="button" onClick={() => void withdrawContact()} disabled={contactBusy}>Quitar correo</button>
                </div>
              ) : (
                <form onSubmit={(event) => void submitContact(event)}>
                  <label htmlFor="guest-contact-email">Correo electrónico</label>
                  <div className="input-wrap">
                    <Mail size={20} />
                    <input
                      id="guest-contact-email"
                      type="email"
                      value={contactEmail}
                      onChange={(event) => setContactEmail(event.target.value)}
                      placeholder="tu@email.com"
                      autoComplete="email"
                      required
                      disabled={contactBusy}
                    />
                  </div>
                  <label className="guest-contact-consent">
                    <input
                      type="checkbox"
                      checked={contactConsent}
                      onChange={(event) => setContactConsent(event.target.checked)}
                      required
                      disabled={contactBusy}
                    />
                    Autorizo que nos contacten por correo para compartir mi premio.
                  </label>
                  <button className="primary-button" type="submit" disabled={contactBusy || !contactConsent}>
                    {contactBusy ? "Guardando…" : "Quiero seguir en contacto"}
                    <ChevronRight size={18} />
                  </button>
                </form>
              )}
              {contactMessage && <p className="guest-contact-message" role="status">{contactMessage}</p>}
            </section>
          )}
          {collectedProfiles.length > 0 && (
            <section className="passport-people">
              <h2>Tus encuentros</h2>
              {collectedProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setSelected(profile)}
                >
                  <Avatar profile={profile} />
                  <span>
                    <strong>{profile.name}</strong>
                    <small>
                      {roleLabels[profile.role]} · {profile.city}
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </section>
          )}
          {authEnabled && (
            <button
              className="text-button signout-button"
              type="button"
              onClick={() => void endSession()}
            >
              Cerrar sesión
            </button>
          )}
        </main>
      )}
      {view === "scan" && (
        <main className="page camera-page">
          <div className="page-center">
            <h1>
              Escanear <em>badge</em>
            </h1>
            <p>Apuntá al QR de la persona que conociste</p>
          </div>
          <Steps stage={1} />
          <div className={`camera-stage ${cameraOpen ? "camera-active" : ""}`}>
            {cameraOpen ? (
              <video ref={videoRef} muted playsInline />
            ) : (
              <div className="camera-placeholder">
                <QrCode size={105} />
                <span>El encuentro empieza con un hola</span>
              </div>
            )}
            <div className="scan-frame">
              <i />
              <i />
              <i />
              <i />
            </div>
            <canvas ref={canvasRef} hidden />
          </div>
          <p className="camera-hint">
            {message || "Escaneá el QR del badge para continuar"}
          </p>
          <div className="camera-controls">
            {!apiBaseUrl ? (
              <button
                className="round-button"
                type="button"
                onClick={() =>
                  document
                    .getElementById("demo-badges")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                aria-label="Ver badges de prueba"
              >
                <ImagePlus size={23} />
              </button>
            ) : <span />}
            <button
              className="shutter"
              type="button"
              onClick={() => (cameraOpen ? stopCamera() : openCamera("scan"))}
              aria-label={cameraOpen ? "Cerrar cámara" : "Abrir cámara"}
            >
              <ScanLine size={31} />
            </button>
            <span className="camera-tip">
              Después, sacate
              <br />
              una foto para
              <br />
              sumar el encuentro
            </span>
          </div>
          {!apiBaseUrl && <div className="demo-badges" id="demo-badges">
            <small>BADGES DE PRUEBA</small>
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => badgeFound(`comunid:builder:${profile.id}`)}
              >
                <Avatar profile={profile} />
                <span>
                  {profile.name}
                  <small>{roleLabels[profile.role]}</small>
                </span>
                <QrCode size={18} />
              </button>
            ))}
          </div>}
        </main>
      )}
      {view === "selfie" && (
        <main className="page camera-page">
          <div className="page-center">
            <h1>
              Selfie del <em>encuentro</em>
            </h1>
            <p>Sacá una foto juntos para completar el encuentro.</p>
          </div>
          <Steps stage={2} />
          <div className="camera-stage selfie-stage">
            {selfie ? (
              <img src={selfie} alt="Selfie del encuentro" />
            ) : cameraOpen ? (
              <video ref={videoRef} muted playsInline />
            ) : (
              <div className="camera-placeholder">
                <Users size={105} />
                <span>Una foto para recordar este encuentro</span>
              </div>
            )}
            <div className="selfie-frame" />
            <canvas ref={canvasRef} hidden />
          </div>
          <div className="selfie-with">
            <Avatar profile={pending || profiles[0]} />
            <span>
              Con {pending?.name || "tu nueva conexión"} ·{" "}
              <em>{pending ? roleLabels[pending.role] : ""}</em>
            </span>
          </div>
          <p className="camera-hint">
            {message ||
              "La foto queda en esta sesión y no se sube al servidor."}
          </p>
          <div className="camera-controls">
            <button
              className="round-button"
              type="button"
              onClick={() => {
                setSelfie(null);
                if (cameraOpen) stopCamera();
              }}
              aria-label="Repetir foto"
            >
              <X size={22} />
            </button>
            <button
              className="shutter selfie-shutter"
              type="button"
              onClick={() =>
                selfie
                  ? setSelfie(null)
                  : cameraOpen
                    ? captureSelfie()
                    : openCamera("selfie")
              }
              aria-label={
                selfie
                  ? "Repetir selfie"
                  : cameraOpen
                    ? "Sacar selfie"
                    : "Abrir cámara"
              }
            >
              <Camera size={28} />
            </button>
            <span className="camera-tip">
              Sacá la foto
              <br />
              para ganar tu sello
            </span>
          </div>
          <button
            className="primary-button finish-button"
            type="button"
            disabled={!pending}
            onClick={finishEncounter}
          >
            {selfie ? "Guardar encuentro" : "Continuar sin foto"}
            <ChevronRight size={20} />
          </button>
        </main>
      )}
      {view === "success" && pending && (
        <main className="page success-page">
          <div className="page-center">
            <span className="confetti">✦ &nbsp; ✧ &nbsp; ✦</span>
            <h1>
              ¡Encuentro
              <br />
              <em>registrado!</em>
            </h1>
            <p>Nueva persona en tu comunidad.</p>
          </div>
          <div className="success-photo">
            {selfie ? (
              <img src={selfie} alt="Selfie del encuentro" />
            ) : (
              <div className="success-avatar">
                <Avatar profile={pending} large />
              </div>
            )}
            <span className="photo-sparkle">✦</span>
          </div>
          <div className="success-person">
            <Avatar profile={pending} />
            <span>
              <small>{roleLabels[pending.role].toUpperCase()} ENCONTRADO</small>
              <strong>
                {pending.name} · {roleLabels[pending.role]}
              </strong>
              <small>Nueva persona en tu comunidad.</small>
            </span>
            <span className="seal">
              SELLO
              <br />✦
            </span>
          </div>
          <div className="success-progress">
            <span>
              <small>TU PASAPORTE</small>
              <strong>
                {Math.min(collectedProfiles.length, 5)} de 5 encuentros
              </strong>
            </span>
            <BookOpen size={24} />
            <div className="progress-track">
              <i
                style={{
                  width: `${Math.min(100, (collectedProfiles.length / 5) * 100)}%`,
                }}
              />
            </div>
          </div>
          <div className="success-reward">
            <Gift size={27} />
            <span>
              <strong>{rewardUnlocked ? "¡Premio desbloqueado!" : "¡Nuevo sello desbloqueado!"}</strong>
              <small>{rewardUnlocked ? "Visitá tu pasaporte para verlo." : "Sumás un sello a tu pasaporte."}</small>
            </span>
            <Sparkles size={19} />
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => go("passport")}
          >
            Ver mi pasaporte <ChevronRight size={20} />
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => go("discover")}
          >
            Seguir explorando
          </button>
        </main>
      )}
      {inApp && (
        <nav className="bottom-nav" aria-label="Navegación principal">
          <button
            className={view === "discover" ? "active" : ""}
            type="button"
            onClick={() => go("discover")}
          >
            <Compass size={21} />
            <span>Descubrir</span>
          </button>
          <button
            className={
              ["scan", "selfie", "success"].includes(view) ? "active" : ""
            }
            type="button"
            onClick={() => go("scan")}
          >
            <ScanLine size={22} />
            <span>Escanear</span>
          </button>
          <button
            className={view === "passport" ? "active" : ""}
            type="button"
            onClick={() => go("passport")}
          >
            <BookOpen size={22} />
            <span>Pasaporte</span>
          </button>
          <button
            className={view === "profile" ? "active" : ""}
            type="button"
            onClick={() => go("profile")}
          >
            <UserRound size={21} />
            <span>Mi perfil</span>
          </button>
        </nav>
      )}
      {selected && (
        <ProfileDialog
          profile={selected}
          collected={collectedIds.has(selected.id)}
          onClose={() => setSelected(null)}
          onScan={() => {
            setSelected(null);
            go("scan");
          }}
        />
      )}
    </div>
  );
}
function Steps({ stage }: { stage: 1 | 2 }) {
  return (
    <div className="steps">
      <span className={stage === 1 ? "current" : "done"}>
        {stage === 1 ? "1" : <Check size={16} />}
        <small>Escanear</small>
      </span>
      <i />
      <span className={stage === 2 ? "current" : ""}>
        2<small>Selfie</small>
      </span>
      <i />
      <span>
        3<small>Sello</small>
      </span>
    </div>
  );
}
function ProfileDialog({
  profile,
  collected,
  onClose,
  onScan,
}: {
  profile: BuilderProfile;
  collected: boolean;
  onClose: () => void;
  onScan: () => void;
}) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (!collected) return;
    const url = tenantId ? window.location.origin : import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin;
    QRCode.toDataURL(tenantProfileUrl(url, profile.id), {
      width: 250,
      margin: 1,
    }).then(setQr);
  }, [profile.id, collected]);
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section
        className="profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Perfil de ${profile.name}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="sheet-close"
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
        >
          <X size={20} />
        </button>
        <div className="sheet-identity">
          <Avatar profile={profile} large />
          <span>
            <small>{roleLabels[profile.role]}</small>
            <h2>{profile.name}</h2>
            <p>{profile.title}</p>
          </span>
        </div>
        {(profile.city || profile.community) && <p className="location-line">
          <MapPin size={16} /> {[profile.city, profile.community].filter(Boolean).join(" · ")}
        </p>}
        {profile.story && <p className="profile-story">{profile.story}</p>}
        {profile.superpower && <div className="detail-block">
          <Sparkles size={21} />
          <span>
            <small>SUPERPODER EN LA COMUNIDAD</small>
            <strong>{profile.superpower}</strong>
          </span>
        </div>}
        {profile.askMeAbout && <div className="detail-block">
          <Users size={21} />
          <span>
            <small>PARA EMPEZAR UNA CHARLA</small>
            <strong>
              Preguntame sobre {profile.askMeAbout.toLowerCase()}.
            </strong>
          </span>
        </div>}
        {collected ? (
          <div className="qr-share">
            {qr && <img src={qr} alt={`QR de ${profile.name}`} />}
            <span>
              <strong>En tu pasaporte</strong>
              <small>Compartí este código para presentar a esta persona.</small>
            </span>
          </div>
        ) : (
          <button className="primary-button" type="button" onClick={onScan}>
            <ScanLine size={20} /> Escanear su badge
          </button>
        )}
      </section>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
