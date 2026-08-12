import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
    envDir: "..",
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      allowedHosts: [".trycloudflare.com"],
      hmr: mode === "stable" ? false : undefined,
      port: 5178,
      strictPort: true,
      proxy: {
        "/api": "http://localhost:8008",
      },
    },
  }));
