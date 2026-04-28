import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiOrigin = process.env.ISEKAI_API_ORIGIN ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    watch: {
      interval: 100,
      usePolling: true
    },
    proxy: {
      "/api": apiOrigin
    }
  }
});
