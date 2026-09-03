/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

import { MathError } from "../errors";
// math.js:3836-4076 — `RealInterval`/`RealIntervalUnion`, usate da
// pattern-matching/`resultsequal` (Task 3). Nessuna dipendenza da altri file
// di math/ né da jme.js — modulo indipendente, come upstream.

// math.js:3836-3981
export class RealInterval {
  start: number;
  end: number;
  includes_start: boolean;
  includes_end: boolean;

  constructor(start: number, end: number, includes_start: boolean, includes_end: boolean) {
    if (start > end) {
      const m = end;
      const im = includes_end;
      end = start;
      includes_end = includes_start;
      start = m;
      includes_start = im;
    }
    includes_start = !!(includes_start && Number.isFinite(start));
    includes_end = !!(includes_end && Number.isFinite(end));
    this.start = start;
    this.end = end;
    this.includes_start = includes_start;
    this.includes_end = includes_end;

    if (this.start == this.end) {
      this.includes_start = this.includes_end = includes_start || includes_end;
    }
  }

  // math.js:3858-3869
  static fromString(str: string): RealInterval {
    const m = str.match(/^([[(])\s*(.*?)\s*(?:\.\.\s*(.*?))?\s*([\])])/);
    if (!m) {
      throw new MathError("math.real interval.invalid string", { str: str });
    }
    const includes_start = m[1] == "[";
    const start = parseFloat(m[2]!);
    const end = m[3] === undefined ? start : parseFloat(m[3]);
    const includes_end = m[4] == "]";
    return new RealInterval(start, end, includes_start, includes_end);
  }

  /** L'intervallo contenente il singolo punto `x`. */
  static singleton(x: number): RealInterval {
    return new RealInterval(x, x, true, true);
  }

  is_empty(): boolean {
    return this.start == this.end && !this.includes_start;
  }

  contains(x: number): boolean {
    return (
      (this.includes_start ? x >= this.start : x > this.start) &&
      (this.includes_end ? x <= this.end : x < this.end)
    );
  }

  overlaps(b: RealInterval): boolean {
    return b.end >= this.start && b.start <= this.end;
  }

  equals(b: RealInterval): boolean {
    return (
      this.start == b.start &&
      this.end == b.end &&
      this.includes_start == b.includes_start &&
      this.includes_end == b.includes_end
    );
  }

  toString(): string {
    return (this.includes_start ? "[" : "(") + this.start + " .. " + this.end + (this.includes_end ? "]" : ")");
  }

  /**
   * Il complemento di questo intervallo.
   * Se questo è vuoto, ritorna un intervallo che copre l'intera retta reale.
   * Se uno o entrambi gli estremi sono ±Infinity, ritorna uno o zero intervalli.
   * Se questo è non vuoto e finito, ritorna due intervalli.
   */
  complement(): RealInterval[] {
    if (this.is_empty()) {
      return [new RealInterval(-Infinity, Infinity, false, false)];
    } else {
      return [
        new RealInterval(-Infinity, this.start, false, this.start != -Infinity && !this.includes_start),
        new RealInterval(this.end, Infinity, this.end != Infinity && !this.includes_end, false),
      ].filter((i) => !i.is_empty());
    }
  }

  /** L'intersezione di due intervalli. Ritorna un singolo intervallo. */
  intersection(b: RealInterval): RealInterval {
    if (!this.overlaps(b)) {
      // empty intersection
      return new RealInterval(0, 0, false, false);
    }

    const start = Math.max(this.start, b.start);
    const end = Math.min(this.end, b.end);

    const includes_start = this.contains(start) && b.contains(start);
    const includes_end = this.contains(end) && b.contains(end);

    return new RealInterval(start, end, includes_start, includes_end);
  }

  /** L'unione di due intervalli. Ritorna uno o due intervalli. */
  union(b: RealInterval): RealInterval[] {
    // upstream: `const a = this;` (math.js:3952) — alias voluto per leggere
    // il metodo come una funzione simmetrica in a/b; regola eslint disattivata
    // localmente invece di riscrivere la logica.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const a: RealInterval = this;
    // if they don't overlap at all, return both intervals
    if (a.end < b.start || a.start > b.end) {
      return a.start < b.start ? [a, b] : [b, a];
    }

    if (b.start == a.end && !(b.includes_start || a.includes_end)) {
      return [a, b];
    }

    if (a.start == b.end && !(a.includes_start || b.includes_end)) {
      return [b, a];
    }

    const start = Math.min(a.start, b.start);
    const end = Math.max(a.end, b.end);
    const includes_start = a.contains(start) || b.contains(start);
    const includes_end = a.contains(end) || b.contains(end);
    return [new RealInterval(start, end, includes_start, includes_end)];
  }

  /** La differenza di due intervalli: intersezione di `this` con il complemento di `b`. */
  difference(b: RealInterval): RealInterval[] {
    return b
      .complement()
      .map((bc) => this.intersection(bc))
      .filter((x) => !x.is_empty());
  }
}

// math.js:3983-4072
export class RealIntervalUnion {
  intervals: RealInterval[];

  constructor(intervalsIn: readonly RealInterval[]) {
    let intervals = intervalsIn.filter((i) => !i.is_empty());

    this.intervals = intervals;
    if (intervals.length == 0) {
      return;
    }

    intervals = [...intervals].sort((a, b) => {
      if (a.start < b.start) {
        return -1;
      } else if (a.start > b.start) {
        return 1;
      } else {
        return a.end < b.end ? -1 : a.end > b.end ? 1 : 0;
      }
    });
    const [a, ...others] = intervals;
    const out: RealInterval[] = [a!];
    for (let b of others) {
      for (let i = 0; i < out.length; i++) {
        const a2 = out[i]!;
        if (b.overlaps(a2)) {
          const [na, nb] = a2.union(b);
          if (nb) {
            out.splice(i, 1, na!);
            b = nb;
          } else {
            out.splice(i, 1);
            b = na!;
          }
        }
      }
      out.push(b);
    }

    this.intervals = out;
  }

  toString(): string {
    return this.intervals.join(" ");
  }

  static fromString(str: string): RealIntervalUnion {
    return new RealIntervalUnion(
      str
        .split(" ")
        .filter((x) => x.length > 0)
        .map((s) => RealInterval.fromString(s))
    );
  }

  equals(b: RealIntervalUnion): boolean {
    return this.intervals.length == b.intervals.length && this.intervals.every((a, i) => a.equals(b.intervals[i]!));
  }

  union(b: RealIntervalUnion): RealIntervalUnion {
    return new RealIntervalUnion(this.intervals.concat(b.intervals));
  }

  intersection(b: RealIntervalUnion): RealIntervalUnion {
    const out = b.intervals.flatMap((bi) => this.intervals.map((ai) => ai.intersection(bi)));
    return new RealIntervalUnion(out);
  }

  complement(): RealIntervalUnion {
    let last = -Infinity;
    let include_last = false;

    const out: RealInterval[] = [];
    for (const i of this.intervals) {
      out.push(new RealInterval(last, i.start, include_last, !i.includes_start));
      last = i.end;
      include_last = !i.includes_end;
    }
    out.push(new RealInterval(last, Infinity, include_last, false));

    return new RealIntervalUnion(out);
  }

  difference(b: RealIntervalUnion): RealIntervalUnion {
    let out = this.intervals.slice();
    for (const bi of b.intervals) {
      out = out.flatMap((a) => a.difference(bi));
    }
    return new RealIntervalUnion(out);
  }

  components(): RealIntervalUnion[] {
    return this.intervals.map((x) => new RealIntervalUnion([x]));
  }
}
