import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { analizzaPratoPlugin } from "./vite-plugin-analizza.mjs";

export default defineConfig({
  plugins: [react(), analizzaPratoPlugin()],
  server: { port: 5173 },
});
