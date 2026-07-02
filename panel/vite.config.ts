import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 开发端口 5178；/api 与 /chat 代理到本地 panel-server（8788），生产由 server 同源托管 dist。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5178,
    proxy: {
      "/api": "http://localhost:8788",
      "/chat": "http://localhost:8788",
    },
  },
});
