import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error type error without @types/node package
import fs from "node:fs";
// @ts-expect-error type error without @types/node package
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

function chunkDocument(sourceName: string, content: string) {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const chunks: Array<{ id: string; source_path: string; title: string; content: string }> = [];
  const hasHeaders = trimmed.split("\n").some((l) => l.trim().startsWith("#"));

  if (hasHeaders) {
    let currentTitle = sourceName;
    let currentLines: string[] = [];

    for (const line of trimmed.split("\n")) {
      const lineTrim = line.trim();
      if (lineTrim.startsWith("#")) {
        if (currentLines.length > 0) {
          const chunkText = currentLines.join("\n").trim();
          if (chunkText) {
            chunks.push({
              id: `${sourceName}-${chunks.length}`,
              source_path: sourceName,
              title: currentTitle,
              content: chunkText,
            });
          }
          currentLines = [];
        }
        currentTitle = lineTrim.replace(/^#+\s*/, "").trim();
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0) {
      const chunkText = currentLines.join("\n").trim();
      if (chunkText) {
        chunks.push({
          id: `${sourceName}-${chunks.length}`,
          source_path: sourceName,
          title: currentTitle,
          content: chunkText,
        });
      }
    }
  } else {
    const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
    let currentChunk: string[] = [];
    let currentWords = 0;
    let chunkIndex = 1;
    const cleanSource = sourceName.replace(/\.[^/.]+$/, "");
    let currentChapter = cleanSource;

    for (const line of lines) {
      const lineWords = line.split(/\s+/).filter(Boolean).length;

      if (
        (line.startsWith("Chapter ") ||
          line.startsWith("CHAPTER ") ||
          line.startsWith("PART ") ||
          line.startsWith("Part ")) &&
        lineWords <= 12
      ) {
        if (currentChunk.length > 0) {
          chunks.push({
            id: `${sourceName}-${chunks.length}`,
            source_path: sourceName,
            title: `${cleanSource} - ${currentChapter}`,
            content: currentChunk.join("\n"),
          });
          currentChunk = [];
          currentWords = 0;
          chunkIndex++;
        }
        currentChapter = line;
      }

      currentChunk.push(line);
      currentWords += lineWords;

      if (currentWords >= 220) {
        chunks.push({
          id: `${sourceName}-${chunks.length}`,
          source_path: sourceName,
          title: `${cleanSource} - ${currentChapter} (Part ${chunkIndex})`,
          content: currentChunk.join("\n"),
        });
        currentChunk = [];
        currentWords = 0;
        chunkIndex++;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push({
        id: `${sourceName}-${chunks.length}`,
        source_path: sourceName,
        title: `${cleanSource} - ${currentChapter} (Part ${chunkIndex})`,
        content: currentChunk.join("\n"),
      });
    }
  }

  return chunks;
}

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
        const allChunks: Array<{ id: string; source_path: string; title: string; content: string }> = [];

        for (const file of files) {
          const filePath = path.join(knowledgeDir, file);
          const stat = fs.statSync(filePath);
          if (!stat.isFile()) continue;

          // If a text companion exists for a PDF, skip the PDF to avoid duplicates
          if (file.toLowerCase().endsWith(".pdf")) {
            const txtTwin = file.replace(/\.pdf$/i, ".txt");
            if (files.includes(txtTwin)) {
              continue;
            }
          }

          if (file.endsWith(".md") || file.endsWith(".txt")) {
            const content = fs.readFileSync(filePath, "utf-8");
            let displaySource = file;
            if (file.toLowerCase().endsWith(".txt")) {
              const pdfTwin = file.replace(/\.txt$/i, ".pdf");
              if (files.includes(pdfTwin)) {
                displaySource = pdfTwin;
              }
            }
            const chunks = chunkDocument(displaySource, content);
            allChunks.push(...chunks);
          }
        }

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(allChunks));
      } catch (err: unknown) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
  },
});

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    define: {
      "import.meta.env.VITE_GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY || ""),
      "import.meta.env.VITE_DEEPGRAM_API_KEY": JSON.stringify(env.DEEPGRAM_API_KEY || ""),
    },
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
