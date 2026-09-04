/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// math.js:2364-2596 — `Numbas.math.Fraction`: numero razionale a precisione
// arbitraria su due `bigint` (`bigNumerator`/`bigDenominator`);
// `numerator`/`denominator` sono getter/setter che convertono a/da
// `Number` — perdita di precisione silenziosa se i bigint superano
// `Number.MAX_SAFE_INTEGER`, come upstream.

import { Decimal } from "./complex-decimal";
import { ensure_bigint, abs } from "./complex";
import { sign } from "./integer-rounding";
import { gcd, lcm } from "./number-theory";
import { rationalApproximation } from "./ranges";

// math.js:2374-2396 — il costruttore upstream raddoppia numeratore/
// denominatore in loop finché non sono entrambi interi; qui il loop è
// limitato a 64 iterazioni per evitare il ciclo potenzialmente infinito
// dell'upstream su input come `NaN` (§6.9 dell'inventario), poi lancia
// `RangeError` (decisione presa, non upstream: divergenza annotata in
// DIVERGENCES.md).
const MAX_DOUBLINGS = 64;

/** Numero razionale a precisione arbitraria. */
export class Fraction {
  bigNumerator: bigint;
  bigDenominator: bigint;

  constructor(numerator: number | bigint, denominator: number | bigint = 1n) {
    let num: number | bigint = numerator;
    let den: number | bigint = denominator;
    if (typeof num == "number" && typeof den == "number") {
      let doublings = 0;
      while (num % 1 != 0 || den % 1 != 0) {
        if (doublings++ >= MAX_DOUBLINGS) {
          throw new RangeError("Fraction: numeratore o denominatore non convertibile a intero");
        }
        num *= 2;
        den *= 2;
      }
    }

    let bigNum = ensure_bigint(num);
    let bigDen = ensure_bigint(den);

    if (bigDen < 0n) {
      bigNum = -bigNum;
      bigDen = -bigDen;
    }

    this.bigNumerator = bigNum;
    this.bigDenominator = bigDen;
  }

  // math.js:2398-2403
  get numerator(): number {
    return Number(this.bigNumerator);
  }
  set numerator(n: number) {
    this.bigNumerator = ensure_bigint(n);
  }

  // math.js:2404-2409
  get denominator(): number {
    return Number(this.bigDenominator);
  }
  set denominator(n: number) {
    this.bigDenominator = ensure_bigint(n);
  }

  // math.js:2411-2417
  toString(): string {
    if (this.bigDenominator == 1n) {
      return this.bigNumerator + "";
    } else {
      return this.bigNumerator + "/" + this.bigDenominator;
    }
  }

  // math.js:2418-2420
  toFloat(): number {
    return Number(this.bigNumerator) / Number(this.bigDenominator);
  }

  // math.js:2421-2423
  toDecimal(): Decimal {
    return new Decimal(Number(this.bigNumerator)).div(new Decimal(Number(this.bigDenominator)));
  }

  // math.js:2424-2435
  reduce(): void {
    if (this.bigDenominator == 0n) {
      return;
    }
    if (this.bigDenominator < 0n) {
      this.bigNumerator = -this.bigNumerator;
      this.bigDenominator = -this.bigDenominator;
    }
    const g = gcd(this.bigNumerator, this.bigDenominator) as bigint;
    this.bigNumerator /= g;
    this.bigDenominator /= g;
  }

  // math.js:2437-2445
  /** Ritorna una copia di questa frazione ridotta ai minimi termini. */
  reduced(): Fraction {
    const f = new Fraction(this.bigNumerator, this.bigDenominator);
    f.reduce();
    return f;
  }

  // math.js:2446-2461
  add(b: Fraction | number): Fraction {
    const bf = typeof b === "number" ? Fraction.fromFloat(b) : b;
    let numerator: bigint;
    let denominator: bigint;
    if (this.bigDenominator == bf.bigDenominator) {
      numerator = this.bigNumerator + bf.bigNumerator;
      denominator = this.bigDenominator;
    } else {
      numerator = this.bigNumerator * bf.bigDenominator + bf.bigNumerator * this.bigDenominator;
      denominator = this.bigDenominator * bf.bigDenominator;
    }
    const f = new Fraction(numerator, denominator);
    f.reduce();
    return f;
  }

  // math.js:2462-2477
  subtract(b: Fraction | number): Fraction {
    const bf = typeof b === "number" ? Fraction.fromFloat(b) : b;
    let numerator: bigint;
    let denominator: bigint;
    if (this.bigDenominator == bf.bigDenominator) {
      numerator = this.bigNumerator - bf.bigNumerator;
      denominator = this.bigDenominator;
    } else {
      numerator = this.bigNumerator * bf.bigDenominator - bf.bigNumerator * this.bigDenominator;
      denominator = this.bigDenominator * bf.bigDenominator;
    }
    const f = new Fraction(numerator, denominator);
    f.reduce();
    return f;
  }

  // math.js:2478-2487
  multiply(b: Fraction | number): Fraction {
    const bf = typeof b === "number" ? Fraction.fromFloat(b) : b;
    const numerator = this.bigNumerator * bf.bigNumerator;
    const denominator = this.bigDenominator * bf.bigDenominator;
    const f = new Fraction(numerator, denominator);
    f.reduce();
    return f;
  }

  // math.js:2488-2497
  divide(b: Fraction | number): Fraction {
    const bf = typeof b === "number" ? Fraction.fromFloat(b) : b;
    const numerator = this.bigNumerator * bf.bigDenominator;
    const denominator = this.bigDenominator * bf.bigNumerator;
    const f = new Fraction(numerator, denominator);
    f.reduce();
    return f;
  }

  // math.js:2498-2500
  reciprocal(): Fraction {
    return new Fraction(this.bigDenominator, this.bigNumerator);
  }

  // math.js:2501-2503
  negate(): Fraction {
    return new Fraction(-this.bigNumerator, this.bigDenominator);
  }

  // math.js:2504-2517
  equals(b: Fraction): boolean {
    return this.subtract(b).bigNumerator == 0n;
  }
  lt(b: Fraction): boolean {
    return this.subtract(b).bigNumerator < 0n;
  }
  gt(b: Fraction): boolean {
    return this.subtract(b).bigNumerator > 0n;
  }
  leq(b: Fraction): boolean {
    return this.subtract(b).bigNumerator <= 0n;
  }
  geq(b: Fraction): boolean {
    return this.subtract(b).bigNumerator >= 0n;
  }

  // math.js:2519-2525
  pow(n: number | bigint): Fraction {
    let nb = ensure_bigint(n);
    const numerator = nb >= 0n ? this.bigNumerator : this.bigDenominator;
    const denominator = nb >= 0n ? this.bigDenominator : this.bigNumerator;
    nb = abs(nb) as bigint;
    return new Fraction(numerator ** nb, denominator ** nb);
  }

  // math.js:2526-2531
  trunc(): number {
    const s = sign(this.bigNumerator) as number;
    const n = abs(this.bigNumerator) as bigint;
    const d = this.bigDenominator;
    return s * Number((n - (n % d)) / d);
  }

  // math.js:2532-2535
  floor(): number {
    const t = this.trunc();
    return this.bigNumerator < 0n && this.bigNumerator % this.bigDenominator != 0n ? t - 1 : t;
  }

  // math.js:2536-2539
  ceil(): number {
    const t = this.trunc();
    return this.bigNumerator > 0n && this.bigNumerator % this.bigDenominator != 0n ? t + 1 : t;
  }

  // math.js:2540-2542
  fract(): Fraction {
    return new Fraction(this.bigNumerator % this.bigDenominator, this.bigDenominator);
  }

  // math.js:2543-2545
  is_zero(): boolean {
    return this.bigNumerator == 0n;
  }

  // math.js:2546-2548
  is_one(): boolean {
    return this.bigNumerator == this.bigDenominator;
  }

  // math.js:2550-2551
  static zero = new Fraction(0n, 1n);
  static one = new Fraction(1n, 1n);

  // math.js:2552-2555
  static fromFloat(n: number): Fraction {
    const approx = rationalApproximation(n);
    return new Fraction(approx[0], approx[1]);
  }

  // math.js:2556-2560
  static fromDecimal(n: Decimal, accuracy?: number): Fraction {
    const acc = accuracy === undefined ? 1e15 : accuracy;
    const approx = n.toFraction(acc);
    return new Fraction(approx[0]!.toNumber(), approx[1]!.toNumber());
  }

  // upstream (math.js:2561-2570): chiama `math.lcm(d, f.denominator)` dove
  // `f.denominator` è il getter (un `number`): dalla prima iterazione in poi
  // `lcm` degrada silenziosamente a calcolare in floating point (perché uno
  // dei due argomenti non è più bigint) — divergenza voluta, vedi
  // DIVERGENCES.md. Qui si passa `BigInt(f.denominator)` per restare in
  // bigint per tutto il calcolo del denominatore comune — risultato
  // equivalente per denominatori ragionevoli, più robusto per quelli
  // grandi; non cambia la precisione finale dei numeratori/denominatori
  // restituiti, che passano comunque dai getter lossy
  // `f.numerator`/`f.denominator` come upstream.
  static common_denominator(fractions: readonly Fraction[]): Fraction[] {
    let d = 1n;
    fractions.forEach((f) => {
      d = lcm(d, BigInt(f.denominator)) as bigint;
    });
    return fractions.map((f) => {
      const m = d / BigInt(f.denominator);
      return new Fraction(BigInt(f.numerator) * m, d);
    });
  }

  // math.js:2571-2583
  static min(...fractions: Fraction[]): Fraction | undefined {
    if (fractions.length == 0) {
      return undefined;
    }
    const commons = Fraction.common_denominator(fractions);
    let best = 0;
    for (let i = 1; i < commons.length; i++) {
      if (commons[i]!.numerator < commons[best]!.numerator) {
        best = i;
      }
    }
    return fractions[best];
  }

  // math.js:2584-2596
  static max(...fractions: Fraction[]): Fraction | undefined {
    if (fractions.length == 0) {
      return undefined;
    }
    const commons = Fraction.common_denominator(fractions);
    let best = 0;
    for (let i = 1; i < commons.length; i++) {
      if (commons[i]!.numerator > commons[best]!.numerator) {
        best = i;
      }
    }
    return fractions[best];
  }
}
