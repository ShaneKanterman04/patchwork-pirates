import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist"
  },
  resolve: {
    alias: {
      "@patchwork/protocol": new URL("../protocol/src/index.ts", import.meta.url).pathname
    }
  }
});
