/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// math.js:2599-2861 — `Numbas.math.ComplexDecimal`: numero complesso a
// componenti `Decimal`, per l'aritmetica a precisione arbitraria usata dal
// tipo JME `decimal` (Task 2+).

import DecimalJs from "decimal.js";
import type { NumbasNumber } from "./types";
import { isComplex } from "./types";

// upstream (math.js:23-28): muta la configurazione GLOBALE della classe
// `Decimal` al caricamento del modulo (`Decimal.set({...})`). Qui invece si
// clona un costruttore locale (`Decimal.clone`) con la stessa
// configurazione, per non mutare uno stato condiviso con eventuali altri
// usi di `decimal.js` nell'app ospite (§4 dell'inventario: "da non portare
// come side-effect a livello di import") — divergenza voluta, vedi
// DIVERGENCES.md: `new Decimal(...)` da `decimal.js` "nudo" e da questo
// modulo si comportano diversamente (precisione/notazione), a differenza
// di upstream dove sono la stessa classe globale mutata. Tutti i file di
// `math/` che servono `Decimal` importano da qui, non direttamente da
// `decimal.js`.
export const Decimal = DecimalJs.clone({
  precision: 40,
  modulo: DecimalJs.EUCLID,
  toExpPos: 1000,
  toExpNeg: -1000,
});
export type Decimal = InstanceType<typeof DecimalJs>;

/** Numero complesso a componenti `Decimal`. */
export class ComplexDecimal {
  re: Decimal;
  im: Decimal;

  constructor(re: Decimal, im?: Decimal) {
    this.re = re;
    this.im = im === undefined ? new Decimal(0) : im;
  }

  // math.js:2642-2650
  toString(): string {
    const re = this.re.toString();
    if (this.isReal()) {
      return re;
    } else {
      const symbol = this.im.isNegative() ? "-" : "+";
      const im = this.im.absoluteValue().toString();
      return re + " " + symbol + " " + im + "i";
    }
  }

  // math.js:2653-2655 — upstream: scarta silenziosamente la parte
  // immaginaria (nessun controllo `isReal()`, nessun avviso) — portato
  // identico (§6.10 dell'inventario, vedi DIVERGENCES.md).
  toNumber(): number {
    return this.re.toNumber();
  }

  // math.js:2657-2663
  toComplexNumber(): NumbasNumber {
    if (this.isReal()) {
      return this.re.toNumber();
    } else {
      return { complex: true, re: this.re.toNumber(), im: this.im.toNumber() };
    }
  }

  // math.js:2665-2667
  isReal(): boolean {
    return this.im.isZero();
  }

  // math.js:2669-2672
  equals(b: ComplexDecimal | Decimal | number): boolean {
    const bd = ensure_decimal(b);
    return this.re.equals(bd.re) && this.im.equals(bd.im);
  }

  // math.js:2674-2680
  lessThan(b: ComplexDecimal | Decimal | number): boolean {
    const bd = ensure_decimal(b);
    if (!(this.isReal() && bd.isReal())) {
      throw new Error("math.order complex numbers");
    }
    return this.re.lessThan(bd.re);
  }

  // math.js:2682-2688
  lessThanOrEqualTo(b: ComplexDecimal | Decimal | number): boolean {
    const bd = ensure_decimal(b);
    if (!(this.isReal() && bd.isReal())) {
      throw new Error("math.order complex numbers");
    }
    return this.re.lessThanOrEqualTo(bd.re);
  }

  // math.js:2690-2696
  greaterThan(b: ComplexDecimal | Decimal | number): boolean {
    const bd = ensure_decimal(b);
    if (!(this.isReal() && bd.isReal())) {
      throw new Error("math.order complex numbers");
    }
    return this.re.greaterThan(bd.re);
  }

  // math.js:2698-2704
  greaterThanOrEqualTo(b: ComplexDecimal | Decimal | number): boolean {
    const bd = ensure_decimal(b);
    if (!(this.isReal() && bd.isReal())) {
      throw new Error("math.order complex numbers");
    }
    return this.re.greaterThanOrEqualTo(bd.re);
  }

  // math.js:2706-2708
  negated(): ComplexDecimal {
    return new ComplexDecimal(this.re.negated(), this.im.negated());
  }

  // math.js:2710-2712
  conjugate(): ComplexDecimal {
    return new ComplexDecimal(this.re, this.im.negated());
  }

  // math.js:2714-2717
  plus(b: ComplexDecimal | Decimal | number): ComplexDecimal {
    const bd = ensure_decimal(b);
    return new ComplexDecimal(this.re.plus(bd.re), this.im.plus(bd.im));
  }

  // math.js:2719-2722
  minus(b: ComplexDecimal | Decimal | number): ComplexDecimal {
    const bd = ensure_decimal(b);
    return new ComplexDecimal(this.re.minus(bd.re), this.im.minus(bd.im));
  }

  // math.js:2723-2728
  times(b: ComplexDecimal | Decimal | number): ComplexDecimal {
    const bd = ensure_decimal(b);
    const re = this.re.times(bd.re).minus(this.im.times(bd.im));
    const im = this.re.times(bd.im).plus(this.im.times(bd.re));
    return new ComplexDecimal(re, im);
  }

  // math.js:2730-2739 — `.dividedBy` per `b==0` ritorna `NaN+0i` invece di lanciare.
  dividedBy(b: ComplexDecimal | Decimal | number): ComplexDecimal {
    const bd = ensure_decimal(b);
    if (bd.isZero()) {
      return new ComplexDecimal(new Decimal(NaN), new Decimal(0));
    }
    const q = bd.re.times(bd.re).plus(bd.im.times(bd.im));
    const re = this.re.times(bd.re).plus(this.im.times(bd.im)).dividedBy(q);
    const im = this.im.times(bd.re).minus(this.re.times(bd.im)).dividedBy(q);
    return new ComplexDecimal(re, im);
  }

  // math.js:2741-2755
  pow(b: ComplexDecimal | Decimal | number): ComplexDecimal {
    const bd = ensure_decimal(b);
    if (this.isReal() && bd.isReal()) {
      if (this.re.greaterThanOrEqualTo(0) || bd.re.isInt()) {
        return new ComplexDecimal(this.re.pow(bd.re), new Decimal(0));
      } else if (bd.re.times(2).isInt()) {
        return new ComplexDecimal(new Decimal(0), this.re.negated().pow(bd.re));
      }
    }
    const ss = this.re.times(this.re).plus(this.im.times(this.im));
    const arg1 = Decimal.atan2(this.im, this.re);
    const mag = ss.pow(bd.re.dividedBy(2)).times(Decimal.exp(bd.im.times(arg1).negated()));
    const arg = bd.re.times(arg1).plus(bd.im.times(Decimal.ln(ss)).dividedBy(2));
    return new ComplexDecimal(mag.times(arg.cos()), mag.times(arg.sin()));
  }

  // math.js:2757-2769
  squareRoot(): ComplexDecimal {
    if (!this.isReal()) {
      const r = this.re.times(this.re).plus(this.im.times(this.im)).squareRoot();
      const re = r.plus(this.re).dividedBy(2).squareRoot();
      const im = new Decimal(this.im.lessThan(0) ? -1 : 1).times(r.minus(this.re).dividedBy(2).squareRoot());
      return new ComplexDecimal(re, im);
    }
    if (this.re.lessThan(0)) {
      return new ComplexDecimal(new Decimal(0), this.re.absoluteValue().squareRoot());
    } else {
      return new ComplexDecimal(this.re.squareRoot());
    }
  }

  // math.js:2771-2774
  reciprocal(): ComplexDecimal {
    const denominator = this.re.pow(2).add(this.im.pow(2));
    return new ComplexDecimal(this.re.dividedBy(denominator), this.im.dividedBy(denominator));
  }

  // math.js:2776-2778 — ritorna un `ComplexDecimal` reale, non uno scalare `Decimal`.
  absoluteValue(): ComplexDecimal {
    return new ComplexDecimal(this.re.times(this.re).plus(this.im.times(this.im)).squareRoot());
  }

  // math.js:2780-2782
  argument(): ComplexDecimal {
    return new ComplexDecimal(Decimal.atan2(this.im, this.re));
  }

  // math.js:2784-2786
  ln(): ComplexDecimal {
    return new ComplexDecimal(this.absoluteValue().re.ln(), this.argument().re);
  }

  // math.js:2788-2791
  exp(): ComplexDecimal {
    const r = this.re.exp();
    return new ComplexDecimal(r.times(Decimal.cos(this.im)), r.times(Decimal.sin(this.im)));
  }

  // math.js:2793-2807
  isInt(): boolean {
    return this.re.isInt() && this.im.isInt();
  }
  isNaN(): boolean {
    return this.re.isNaN() || this.im.isNaN();
  }
  isZero(): boolean {
    return this.re.isZero() && this.im.isZero();
  }
  isOne(): boolean {
    return this.im.isZero() && this.re.equals(new Decimal(1));
  }

  // math.js:2809-2811
  round(): ComplexDecimal {
    return new ComplexDecimal(this.re.round(), this.im.round());
  }

  // math.js:2813-2815
  toDecimalPlaces(dp: number): ComplexDecimal {
    return new ComplexDecimal(this.re.toDecimalPlaces(dp), this.im.toDecimalPlaces(dp));
  }

  // math.js:2817-2826
  toFixed(dp?: number): string {
    const re = this.re.toFixed(dp);
    if (this.isReal()) {
      return re;
    } else {
      const symbol = this.im.isNegative() ? "-" : "+";
      const im = this.im.absoluteValue().toFixed(dp);
      return re + " " + symbol + " " + im + "i";
    }
  }

  // math.js:2828-2830
  toNearest(n: DecimalJs.Value): ComplexDecimal {
    return new ComplexDecimal(this.re.toNearest(n), this.im.toNearest(n));
  }

  // math.js:2832-2841
  toPrecision(sf?: number): string {
    const re = this.re.toPrecision(sf);
    if (this.isReal()) {
      return re;
    } else {
      const symbol = this.im.isNegative() ? "-" : "+";
      const im = this.im.absoluteValue().toPrecision(sf);
      return re + " " + symbol + " " + im + "i";
    }
  }

  // math.js:2843-2845
  toSignificantDigits(sf?: number): ComplexDecimal {
    return new ComplexDecimal(this.re.toSignificantDigits(sf), this.im.toSignificantDigits(sf));
  }

  // math.js:2848-2853
  static min(a: ComplexDecimal, b: ComplexDecimal): ComplexDecimal {
    if (!(a.isReal() && b.isReal())) {
      throw new Error("math.order complex numbers");
    }
    return new ComplexDecimal(Decimal.min(a.re, b.re));
  }

  // math.js:2854-2859
  static max(a: ComplexDecimal, b: ComplexDecimal): ComplexDecimal {
    if (!(a.isReal() && b.isReal())) {
      throw new Error("math.order complex numbers");
    }
    return new ComplexDecimal(Decimal.max(a.re, b.re));
  }
}

// math.js:2604-2613
/** Coerce `n` a un valore `ComplexDecimal`. */
export function ensure_decimal(n: ComplexDecimal | Decimal | NumbasNumber): ComplexDecimal {
  if (n instanceof ComplexDecimal) {
    return n;
  } else if (n instanceof Decimal) {
    return new ComplexDecimal(n);
  } else if (isComplex(n)) {
    return new ComplexDecimal(new Decimal(n.re), new Decimal(n.im));
  }
  return new ComplexDecimal(new Decimal(n as number | bigint));
}

// math.js:2621-2623
/** `n` è un valore `ComplexDecimal`? */
export function isComplexDecimal(n: unknown): n is ComplexDecimal {
  return n instanceof ComplexDecimal;
}
