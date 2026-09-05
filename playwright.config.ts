import { defineConfig } from "@playwright/test";

// 3100, non 3000: la 3000 è la porta dell'utente, e con
// `reuseExistingServer: true` una prova lanciata senza pensarci si
// attaccherebbe a qualunque cosa vi stia già girando — girando i test contro
// un'applicazione che non è quella del worktree, e scrivendone il database.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: BASE_URL,
    headless: true,
  },
  webServer: {
    // Override AUTH_URL / NEXTAUTH_URL so NextAuth uses the local dev
    // origin instead of the production domain baked into .env (which
    // otherwise causes redirects to https://www.savint.it/...).
    command: `AUTH_URL=${BASE_URL}/savint NEXTAUTH_URL=${BASE_URL} PORT=${PORT} npm run dev:custom`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
