/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// math.js:676-737 (piDegree, addDigits, toExponential) e 1160-1401
// (precround, parseScientific, unscientific, siground, countDP,
// countSigFigs, toGivenPrecision(Scientific), withinTolerance).
//
// `precround`/`siground`/`countSigFigs` sono portate VERBATIM (regex
// incluse): sono le funzioni più delicate del file (§6.4, §6.11
// dell'inventario) — vedi i commenti sui singoli gruppi di cattura. Non si
// "ripuliscono" con `toFixed`/`Number.EPSILON`: i casi limite dei test
// upstream dipendono dal comportamento esatto di queste soglie magiche.

import type { NumbasNumber } from "./types";
import { isComplex } from "./types";
import { complex, add, sub } from "./complex";
import { isclose, geq, leq, eq } from "./compare";
import { sign, round } from "./integer-rounding";
import { MathError } from "../errors";

// math.js:21
/** Il numero massimo di cifre decimali a cui un float può essere arrotondato. */
export const MAX_FLOAT_PRECISION = 17;

// math.js:676-698
/** Se `n` si può scrivere come `a*pi^k` con `a` intero, ritorna il più grande
 * `k` possibile; ritorna anche `1` per `n` del tipo `pi/k` con `k` intero
 * `<1000`, se `allowFractions` è vero. */
export function piDegree(n: NumbasNumber, allowFractions?: boolean): number {
  if (typeof n === "bigint") {
    return 0;
  }
  if (allowFractions === undefined) {
    allowFractions = true;
  }

  const nn = Math.abs(n as number);
  if (nn > 10000) {
    // so big numbers don't get rounded to a power of pi accidentally
    return 0;
  }
  let degree: number;
  let a: number;

  // Check for pi/k, where k is an integer < 1000
  a = Math.PI / nn;
  if (allowFractions && a < 1000 && Math.abs(a - (round(a) as number)) < 0.0000000001) {
    return 1;
  }

  for (
    degree = 1;
    (a = nn / Math.pow(Math.PI, degree)) > 1 &&
    Math.abs(a - (round(a) as number)) > 0.00000001 &&
    Math.abs(1 / a - (round(1 / a) as number)) > 0.00000001;
    degree++
  ) {
    /* empty */
  }
  return a >= 1 ? degree : 0;
}

// math.js:705-719
/** Aggiunge il numero dato di zeri decimali alla rappresentazione stringa di un numero. */
export function addDigits(n: string | number, digits: number): string {
  let s = n + "";
  const m = s.match(/^(-?\d+(?:\.\d+)?)(e[-+]?\d+)$/);
  if (m) {
    return addDigits(m[1]!, digits) + m[2];
  } else {
    if (s.indexOf(".") == -1) {
      s += ".";
    }
    for (let i = 0; i < digits; i++) {
      s += "0";
    }
    return s;
  }
}

// math.js:726-737
/** Converte un numero in notazione esponenziale. */
export function toExponential(n: NumbasNumber): string {
  if (typeof n === "bigint") {
    if (n < 0n) {
      return "-" + toExponential(-n);
    }
    const s = n.toString();
    const p = s.length - 1;
    return s[0] + (p > 0 ? "." + s.slice(1) : "") + "e+" + p;
  } else {
    return (n as number).toExponential();
  }
}

// math.js:1160-1199 — VERBATIM (§6.4 dell'inventario).
/** Arrotonda `a` a `b` cifre decimali; parti reale/immaginaria indipendenti
 * sui complessi. Corregge a mano gli errori tipici del floating point con
 * soglie di tolleranza (`1e-9`). */
export function precround(a: NumbasNumber, b: NumbasNumber): NumbasNumber {
  if (isComplex(b)) {
    throw new MathError("math.precround.complex");
  }
  if (isComplex(a)) {
    return complex(precround(a.re, b) as number, precround(a.im, b) as number);
  } else {
    const bn = Math.min(b as number, MAX_FLOAT_PRECISION);
    const an = a as number;
    const be = Math.pow(10, bn);
    let fracPart = an % 1;
    const intPart = an - fracPart;
    // test to allow a bit of leeway to account for floating point errors
    // if a*10^b is less than 1e-9 away from having a five as the last digit of its whole part, round it up anyway
    const v = ((fracPart * be * 10) % 1) as number;
    const d = (fracPart > 0 ? Math.floor : Math.ceil)((fracPart * be * 10) % 10);
    // multiply fractional part by 10^b; we'll throw away the remaining fractional part (stuff < 10^b)
    fracPart *= be;
    if ((d == 4 && 1 - v < 1e-9) || (d == -5 && v > -1e-9 && v < 0)) {
      fracPart += 1;
    }
    const rounded_fracPart = Math.round(fracPart);
    // if the fractional part has rounded up to a whole number, just add sgn(fracPart) to the integer part
    if (rounded_fracPart == be || rounded_fracPart == -be) {
      return intPart + (sign(fracPart) as number);
    }
    // get the fractional part as a string of decimal digits
    let fracPartString = Math.round(Math.abs(fracPart)) + "";
    while (fracPartString.length < bn) {
      fracPartString = "0" + fracPartString;
    }
    // construct the rounded number as a string, then convert it to a JS float
    const out = parseFloat(intPart + "." + fracPartString);
    // make sure a negative number remains negative
    if (intPart == 0 && an < 0) {
      return -out;
    } else {
      return out;
    }
  }
}

// math.js:1207-1217
/** Estrae significando/esponente da una stringa in notazione scientifica. */
export function parseScientific(
  str: string,
  parse?: boolean
): { significand: number; exponent: number } | { significand: string; exponent: string } {
  const m = /(-?\d[ \d]*(?:\.\d[ \d]*)?)e([-+]?\d[ \d]*)/i.exec(str)!;
  const significand = m[1]!.replace(/ /g, "");
  const exponent = m[2]!.replace(/ /g, "").replace(/^\+/, "");
  parse = parse || parse === undefined;
  if (parse) {
    return { significand: parseFloat(significand), exponent: parseInt(exponent) };
  } else {
    return { significand, exponent };
  }
}

// math.js:1219-1262
/** Se la stringa data è in notazione scientifica, la riscrive in notazione
 * posizionale piena. Esempio: `'1.23e-5'` → `'0.0000123'`. */
export function unscientific(str: string): string {
  const m = /(-)? *(0|[1-9][ \d]*)(?:\.([ \d]+))?e([-+]?[\d ]+)/i.exec(str);
  if (!m) {
    return str;
  }
  const minus = m[1] || "";
  const significand_integer = m[2]!.replace(/ /g, "");
  const significand_decimal = (m[3] || "").replace(/ /g, "");
  let digits = significand_integer + significand_decimal;
  let pow = parseInt(m[4]!.replace(/ /g, ""));
  pow += significand_integer.length;
  const zm = digits.match(/^(0+)[^0]/);
  if (zm) {
    const num_zeros = zm[1]!.length;
    digits = digits.slice(num_zeros);
    pow -= num_zeros;
  }
  const l = digits.length;
  let out: string;
  if (l < pow) {
    out = digits;
    for (let i = l; i < pow; i++) {
      out += "0";
    }
  } else if (pow <= 0) {
    out = digits;
    for (let i = 0; i < -pow; i++) {
      out = "0" + out;
    }
    out = "0." + out;
  } else {
    out = digits.slice(0, pow);
    if (digits.length > pow) {
      out += "." + digits.slice(pow);
    }
  }
  return minus + out;
}

// math.js:1263-1282
/** Arrotonda `a` a `b` cifre significative; parti reale/immaginaria
 * indipendenti sui complessi. */
export function siground(a: NumbasNumber, b: NumbasNumber): NumbasNumber {
  if (isComplex(b)) {
    throw new MathError("math.siground.complex");
  }
  if (isComplex(a)) {
    return complex(siground(a.re, b) as number, siground(a.im, b) as number);
  } else {
    if (isclose(a, 0)) {
      return 0;
    }
    return parseFloat((a as number).toPrecision(b as number));
  }
}

// math.js:1283-1299
/** Conta le cifre decimali nella rappresentazione stringa di un numero. */
export function countDP(n: NumbasNumber | string): number {
  const m = (n + "").match(/(?:\.(\d*))?(?:[Ee]([-+])?(\d+))?$/);
  if (!m) {
    return 0;
  } else {
    let dp = m[1] ? m[1].length : 0;
    if (m[2] && m[2] == "-") {
      dp += parseInt(m[3]!);
    }
    return dp;
  }
}

// math.js:1300-1320 — VERBATIM (§6.11 dell'inventario): due regex quasi
// identiche ma con quantificatori diversi su `0*` a seconda di `max`.
/** Calcola la precisione in cifre significative di un numero. `n` è una
 * stringa già "pulita" da `cleanNumber` (notazione "plain" o scientifica).
 * Se `max` è vero, è più permissivo sugli zeri finali di numeri interi
 * (es. `'1000'` può valere 4 cifre significative). */
export function countSigFigs(n: NumbasNumber | string, max?: boolean): number {
  const s = n + "";
  let m: RegExpMatchArray | null;
  if (max) {
    // gruppi: 1=intero seguito da soli zeri, 2=intero senza zero finale
    // significativo, 3=decimale con parte intera 1-9, 4=`0.0...0` puro,
    // 5=`0.0...` con cifre significative dopo gli zeri, 6=notazione E/e.
    m = s.match(
      /^-?(?:(\d0*)$|(?:([1-9]\d*[1-9]0*)$)|([1-9]\d*\.\d+$)|(0\.0+$)|(?:0\.0*([1-9]\d*))|(?:(\d*(?:\.\d+)?)\s*[Ee]\s*[+-]?\d+)$)/i
    );
  } else {
    m = s.match(
      /^-?(?:(\d)0*$|(?:([1-9]\d*[1-9])0*$)|([1-9]\d*\.\d+$)|(0\.0+$)|(?:0\.0*([1-9]\d*))|(?:(\d*(?:\.\d+)?)\s*[Ee]\s*[+-]?\d+)$)/i
    );
  }
  if (!m) {
    return 0;
  }
  const sigFigs = m[1] || m[2] || m[3] || m[4] || m[5] || m[6] || "";
  return sigFigs.replace(".", "").length;
}

// math.js:1329-1350
/** `n` è già scritto con la precisione desiderata? */
export function toGivenPrecision(
  n: NumbasNumber | string,
  precisionType: "dp" | "sigfig" | "none",
  precision: number,
  strictPrecision: boolean
): boolean {
  if (precisionType == "none") {
    return true;
  }
  const s = n + "";
  let precisionOK: boolean;
  const counters = { dp: countDP, sigfig: countSigFigs };
  const counter = counters[precisionType];
  const digits = counter(s);
  if (strictPrecision) {
    precisionOK = digits == precision;
  } else {
    precisionOK = digits <= precision;
  }
  if (precisionType == "sigfig" && !precisionOK && digits < precision && /[1-9]\d*0+$/.test(s)) {
    // in cases like 2070, which could be to either 3 or 4 sig figs
    const trailingZeroes = s.match(/0*$/)![0].length;
    if (digits + trailingZeroes >= precision) {
      precisionOK = true;
    }
  }
  return precisionOK;
}

// math.js:1366-1376
/** Come `toGivenPrecision`, ma per notazione scientifica (guarda solo il significando). */
export function toGivenPrecisionScientific(
  n: NumbasNumber | string,
  precisionType: "dp" | "sigfig" | "none",
  precision: number
): boolean {
  if (precisionType == "none") {
    return true;
  }
  const s = n + "";
  const m = /(-?(?:0|[1-9]\d*)(?:\.\d+)?)[eE]([+-]?\d+)/.exec(s);
  if (!m) {
    return false;
  }
  return toGivenPrecision(m[1]!, "dp", precision + (precisionType == "sigfig" ? -1 : 0), true);
}

// math.js:1384-1397
/** `a` è entro +/- `tolerance` da `b`? */
export function withinTolerance(a: NumbasNumber, b: NumbasNumber, tolerance: number): boolean {
  if (isComplex(a) || isComplex(b)) {
    // upstream: `math.complex(a,0)` collassa su `a` (im=0 è falsy, §6.3),
    // quindi se solo uno dei due è complesso l'altro resta un numero grezzo
    // e `.re`/`.im` valgono `undefined` — bug latente upstream, non
    // esercitato da alcun test noto; portato as-is (nessun "fix" silenzioso).
    const ac = isComplex(a) ? a : complex(a as number, 0);
    const bc = isComplex(b) ? b : complex(b as number, 0);
    const are = isComplex(ac) ? ac.re : (undefined as unknown as NumbasNumber);
    const aim = isComplex(ac) ? ac.im : (undefined as unknown as NumbasNumber);
    const bre = isComplex(bc) ? bc.re : (undefined as unknown as NumbasNumber);
    const bim = isComplex(bc) ? bc.im : (undefined as unknown as NumbasNumber);
    return withinTolerance(are, bre, tolerance) && withinTolerance(aim, bim, tolerance);
  }
  if (tolerance == 0) {
    return eq(a, b);
  } else {
    const upper = add(b, tolerance);
    const lower = sub(b, tolerance);
    return geq(a, lower) && leq(a, upper);
  }
}
