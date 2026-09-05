import path from "path";
import { seedEsercizi } from "../src/lib/esercizi/seed";

const dir = path.resolve(process.cwd(), "content/esercizi");
seedEsercizi(dir)
  .then((r) => { console.log(`esercizi: ${r.creati} creati, ${r.aggiornati} aggiornati, ${r.invariati} invariati`); process.exit(0); })
  .catch((e) => { console.error(e.message); process.exit(1); });
