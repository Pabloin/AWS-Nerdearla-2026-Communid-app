import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// A native build must never silently use the legacy event or another tenant.
const cwd = fileURLToPath(new URL("../front_mobile/", import.meta.url));
const env = {
  ...process.env,
  VITE_EVENT_ID: "reinvent-2026",
  VITE_EVENT_NAME: "re:Invent 2026",
  VITE_FIXED_TENANT_ID: "reinvent",
  VITE_TENANT_DOMAIN: "comunid.app",
  VITE_API_BASE_URL: "https://p152jvhrf7.execute-api.us-east-2.amazonaws.com",
  VITE_PUBLIC_APP_URL: "https://reinvent.comunid.app",
  VITE_MOBILE_BASE: "/",
};
execFileSync("npm", ["run", "build", "--", "--outDir", "dist-android"], { cwd, env, stdio: "inherit" });
