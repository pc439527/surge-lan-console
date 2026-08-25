/// <reference types="vitest/config" />
import { execSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

function gitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

function gitBranch(): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

function buildTime(): string {
  return new Date().toISOString();
}

export const APP_VERSION = process.env.VITE_APP_VERSION ?? "0.2.0";
export const GIT_COMMIT = process.env.VITE_GIT_COMMIT ?? gitCommit();
export const GIT_BRANCH = process.env.VITE_GIT_BRANCH ?? gitBranch();
export const BUILD_TIME = process.env.VITE_BUILD_TIME ?? buildTime();
export const APP_ENV = process.env.VITE_APP_ENV ?? "production";

function versionJsonPlugin(): Plugin {
  const virtualId = "\0surge-version-json";
  return {
    name: "surge-version-json",
    resolveId(id) {
      if (id === virtualId) return virtualId;
    },
    load(id) {
      if (id === virtualId) {
        return `export default ${JSON.stringify({
          version: APP_VERSION,
          commit: GIT_COMMIT,
          branch: GIT_BRANCH,
          build: BUILD_TIME,
          environment: APP_ENV,
        })}`;
      }
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify(
          {
            version: APP_VERSION,
            commit: GIT_COMMIT,
            branch: GIT_BRANCH,
            build: BUILD_TIME,
            environment: APP_ENV,
          },
          null,
          2,
        ),
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    versionJsonPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Surge LAN Console",
        short_name: "Surge Console",
        description: "Apple-style Surge management console for your LAN",
        theme_color: "#f3f6fb",
        background_color: "#f3f6fb",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192x192.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "pwa-512x512.svg", sizes: "512x512", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __GIT_COMMIT__: JSON.stringify(GIT_COMMIT),
    __GIT_BRANCH__: JSON.stringify(GIT_BRANCH),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __APP_ENV__: JSON.stringify(APP_ENV),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ["echarts"],
          codemirror: ["@uiw/react-codemirror"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
