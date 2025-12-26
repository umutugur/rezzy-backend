import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_DEV_PROXY_TARGET || "http://localhost:4000";

  return {
    plugins: [react()],

    // ✅ Electron prod (loadFile) için kritik
    base: "./",

    build: {
      outDir: "dist",
      assetsDir: "assets",
    },

    server: {
      port: 5173,
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
        },
      },
    },
  };
});