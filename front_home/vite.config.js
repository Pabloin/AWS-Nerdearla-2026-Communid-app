import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "/",
  build: { sourcemap: true, rollupOptions: { input: {
    index: resolve(import.meta.dirname, "index.html"),
    tenants: resolve(import.meta.dirname, "tenants.html"),
    hero: resolve(import.meta.dirname, "hero.html"),
    somos: resolve(import.meta.dirname, "somos.html")
  } } }
});
