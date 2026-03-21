import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), cloudflare()],
  server: {
    port: 8080,
    open: true,
    allowedHosts: [
      "*.ngrok-free.app",
      "4a52-2402-800-6294-1744-d410-a64d-727c-c579.ngrok-free.app",
      "*",
    ],
  },
});