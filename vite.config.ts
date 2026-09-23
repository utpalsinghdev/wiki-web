import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import { vaultPlugin } from "./vite-plugin-vault.ts"

export default defineConfig({
  plugins: [react(), tailwindcss(), vaultPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 4000,
    strictPort: true,
    allowedHosts: true,
  },
})
