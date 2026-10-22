import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error type error without @types/node package
import fs from "node:fs";
// @ts-expect-error type error without @types/node package
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

const knowledgePlugin = () => ({
  name: "knowledge-docs-api",
  configureServer(server: { middlewares: { use: (route: string, handler: (req: unknown, res: { setHeader: (k: string, v: string) => void; end: (d: string) => void; statusCode?: number }) => void) => void } }) {
    server.middlewares.use("/api/knowledge-docs", (_req, res) => {
      try {
        const knowledgeDir = path.resolve(process.cwd(), "knowledge");
        if (!fs.existsSync(knowledgeDir)) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify([]));
          return;
        }
        const files = fs.readdirSync(knowledgeDir).filter((f: string) => !f.startsWith("."));
        const docs = files.map((file: string, idx: number) => {
          const filePath = path.join(knowledgeDir, file);
          const stat = fs.statSync(filePath);
          const isText = file.endsWith(".md") || file.endsWith(".txt");
          const content = isText
            ? fs.readFileSync(filePath, "utf-8")
            : `Indexed document (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`;

          return {
            id: `doc-${idx}`,
            source_path: file,
            title: file.replace(/\.[^/.]+$/, ""),
            content,
          };
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(docs));
      } catch (err: unknown) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
  },
});

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), knowledgePlugin()],

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});
