import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  // In production (Cloud Run), the SPA is served from geekgully.com/factory/
  // This base ensures all JS/CSS asset paths are correctly prefixed.
  base: process.env.NODE_ENV === "production" ? "/factory/" : "/",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true
      }
    }
  }
})

