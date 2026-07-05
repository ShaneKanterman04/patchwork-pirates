import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true, // listen on 0.0.0.0 so other devices on the LAN can reach the dashboard
    port: 5173
  },
  build: {
    outDir: "dist"
  },
  resolve: {
    alias: {
      "@patchwork/content": new URL("../content/src/index.ts", import.meta.url).pathname,
      "@patchwork/protocol": new URL("../protocol/src/index.ts", import.meta.url).pathname
    }
  }
});
