import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import { ricalcola } from "../marking";

const dir = path.resolve(process.cwd(), "content/esercizi");
const file = readdirSync(dir).filter((f) => f.endsWith(".json"));

describe("ricalcolo lato server", () => {
  it.each(file)("su %s da' lo stesso punteggio del motore nel browser", (nome) => {
    const { question } = JSON.parse(readFileSync(path.join(dir, nome), "utf8")) as { question: NumbasQuestionJSON };
    const seed = `parita-${nome}`;

    // "Client": carica, risponde giusto a ogni parte di primo livello, serializza.
    // Si esclude `isGap`: un gap non si sottomette da solo, lo fa la sua
    // parte gapfill — sottomettere il gap direttamente non è equivalente a
    // sottomettere il genitore e renderebbe il test fragile per un motivo
    // estraneo a quel che vuole verificare.
    const q = loadQuestion(question, { seed, locale: "it" });
    for (const p of q.allParts()) {
      if (p.type === "information" || p.isGap) continue;
      p.submit(p.correctAnswer());
    }
    q.updateScore();
    const statoClient = q.toState();
    const punteggioClient = q.score();

    // "Server": ricalcola dallo stesso seme e dallo stesso stato.
    const esito = ricalcola(question, seed, statoClient, "it");

    expect(esito.score).toBeCloseTo(punteggioClient.score, 9);
    expect(esito.maxScore).toBeCloseTo(punteggioClient.marks, 9);
  });

  it("una risposta sbagliata non prende punti", () => {
    const { question } = JSON.parse(
      readFileSync(path.join(dir, "01-equazione-primo-grado.json"), "utf8"),
    ) as { question: NumbasQuestionJSON };
    const q = loadQuestion(question, { seed: "sbagliata", locale: "it" });
    q.getPart("p0")!.submit("999999");
    q.updateScore();
    const esito = ricalcola(question, "sbagliata", q.toState(), "it");
    expect(esito.score).toBe(0);
    expect(esito.maxScore).toBeGreaterThan(0);
  });

  it("uno stato assente da' punteggio zero e stato iniziale", () => {
    const { question } = JSON.parse(
      readFileSync(path.join(dir, "01-equazione-primo-grado.json"), "utf8"),
    ) as { question: NumbasQuestionJSON };
    const esito = ricalcola(question, "vuoto", null, "it");
    expect(esito.score).toBe(0);
    expect(esito.state.parts.length).toBeGreaterThan(0);
  });

  it("uno stato con un seme diverso viene ignorato a favore di quello del tentativo", () => {
    const { question } = JSON.parse(
      readFileSync(path.join(dir, "01-equazione-primo-grado.json"), "utf8"),
    ) as { question: NumbasQuestionJSON };
    const q = loadQuestion(question, { seed: "altro-seme", locale: "it" });
    q.getPart("p0")!.submit(q.getPart("p0")!.correctAnswer());
    q.updateScore();
    const statoAltrui = q.toState();
    const esito = ricalcola(question, "il-mio-seme", statoAltrui, "it");
    expect(esito.state.seed).toBe("il-mio-seme");
  });
});
