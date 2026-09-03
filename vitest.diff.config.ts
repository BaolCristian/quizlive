import { defineConfig } from "vitest/config";

// I test differenziali del motore (`packages/engine/test/differential/`)
// caricano il bundle Numbas upstream (1,6 MB) dentro jsdom e confrontano il
// port con esso: sono lenti, e per questo sono esclusi dal `vitest.config.ts`
// della radice e girano con `npm run test:engine:diff`.
//
// Config a parte, non un filtro sulla riga di comando, perché `exclude` della
// radice li scarterebbe comunque: il filtro posizionale di vitest restringe
// l'insieme, non annulla `exclude`.
export default defineConfig({
  test: {
    // Il bundle upstream crea da sé le globali `window`/`document` di jsdom
    // (v. `test/differential/oracle.ts`): l'ambiente di vitest resta `node`.
    environment: "node",
    globals: true,
    include: ["packages/engine/test/differential/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    // Caricare e far girare il bundle è dell'ordine dei secondi per file.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
