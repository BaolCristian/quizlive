/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// math.js:1403-1697 — fattoriale/gamma, esponenziali, trigonometria e
// iperboliche (reali e complesse).

import type { NumbasNumber } from "./types";
import { isComplex } from "./types";
import { complex, add, sub, mul, div, negate, pow, sqrt, exp, log, abs, re, im, ensure_bigint } from "./complex";
import { isInt } from "./predicates";

// math.js:1403-1418
/** Fattoriale, o `Gamma(n+1)` se `n` non è un intero non negativo. */
export function factorial(n: NumbasNumber): NumbasNumber {
  if (isInt(n) && (n as number) >= 0) {
    if ((n as number) <= 1) {
      return 1n;
    } else {
      const nb = ensure_bigint(n as number);
      let j = 1n;
      for (let i = 2n; i <= nb; i++) {
        j *= i;
      }
      return j;
    }
  } else {
    // gamma function extends factorial to non-ints and negative numbers
    return gamma(add(n, 1));
  }
}

// math.js:1424-1448
/** Approssimazione di Lanczos alla funzione gamma. */
export function gamma(n: NumbasNumber): NumbasNumber {
  const g = 7;
  const p = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  const pi = Math.PI;
  if ((isComplex(n) && n.re < 0.5) || (!isComplex(n) && (n as number) < 0.5)) {
    return div(pi, mul(sin(mul(pi, n)), gamma(sub(1, n))));
  } else {
    const nn: NumbasNumber = sub(n, 1); // n -= 1
    let x: NumbasNumber = p[0]!;
    for (let i = 1; i < g + 2; i++) {
      x = add(x, div(p[i]!, add(nn, i))); // x += p[i]/(n+i)
    }
    const t = add(nn, add(g, 0.5)); // t = n+g+0.5
    return mul(sqrt(2 * pi), mul(pow(t, add(nn, 0.5)), mul(exp(negate(t)), x))); // sqrt(2*pi)*t^(z+0.5)*exp(-t)*x
  }
}

// math.js:1454-1456
/** Logaritmo in base 10. */
export function log10(n: NumbasNumber): NumbasNumber {
  return mul(log(n), Math.LOG10E);
}

// math.js:1463-1465
/** Logaritmo in base arbitraria: `log(n)/log(b)`. */
export function log_base(n: NumbasNumber, b: NumbasNumber): NumbasNumber {
  return div(log(n), log(b));
}

// math.js:1472-1474
/** Converte da gradi a radianti. */
export function radians(x: NumbasNumber): NumbasNumber {
  return mul(x, Math.PI / 180);
}

// math.js:1481-1483
/** Converte da radianti a gradi. */
export function degrees(x: NumbasNumber): NumbasNumber {
  return mul(x, 180 / Math.PI);
}

// math.js:1489-1495
/** Coseno. */
export function cos(x: NumbasNumber): NumbasNumber {
  if (isComplex(x)) {
    return complex(Math.cos(x.re) * (cosh(x.im) as number), -Math.sin(x.re) * (sinh(x.im) as number));
  } else {
    return Math.cos(x as number);
  }
}

// math.js:1501-1507
/** Seno. */
export function sin(x: NumbasNumber): NumbasNumber {
  if (isComplex(x)) {
    return complex(Math.sin(x.re) * (cosh(x.im) as number), Math.cos(x.re) * (sinh(x.im) as number));
  } else {
    return Math.sin(x as number);
  }
}

// math.js:1513-1519
/** Tangente. */
export function tan(x: NumbasNumber): NumbasNumber {
  if (isComplex(x)) {
    return div(sin(x), cos(x));
  } else {
    return Math.tan(x as number);
  }
}

// math.js:1525-1527
/** Cosecante. */
export function cosec(x: NumbasNumber): NumbasNumber {
  return div(1, sin(x));
}

// math.js:1533-1535
/** Secante. */
export function sec(x: NumbasNumber): NumbasNumber {
  return div(1, cos(x));
}

// math.js:1541-1543
/** Cotangente. */
export function cot(x: NumbasNumber): NumbasNumber {
  return div(1, tan(x));
}

// math.js:1549-1558
/** Arcoseno. */
export function arcsin(x: NumbasNumber): NumbasNumber {
  if (isComplex(x) || (abs(x) as number) > 1) {
    const i = complex(0, 1);
    const ni = complex(0, -1);
    const ex = add(mul(x, i), sqrt(sub(1, mul(x, x)))); // ix+sqrt(1-x^2)
    return mul(ni, log(ex));
  } else {
    return Math.asin(x as number);
  }
}

// math.js:1564-1576
/** Arcocoseno. */
export function arccos(x: NumbasNumber): NumbasNumber {
  if (isComplex(x) || (abs(x) as number) > 1) {
    const ni = complex(0, -1);
    const ex = add(x, sqrt(sub(mul(x, x), 1))); // x+sqrt(x^2-1)
    let result = mul(ni, log(ex));
    if (re(result) < 0 || (re(result) == 0 && im(result) < 0)) {
      result = negate(result);
    }
    return result;
  } else {
    return Math.acos(x as number);
  }
}

// math.js:1582-1590
/** Arcotangente. */
export function arctan(x: NumbasNumber): NumbasNumber {
  if (isComplex(x)) {
    const i = complex(0, 1);
    const ex = div(add(i, x), sub(i, x));
    return mul(complex(0, 0.5), log(ex));
  } else {
    return Math.atan(x as number);
  }
}

// math.js:1597-1605
/** Angolo fra l'asse x e la retta per l'origine e `(x,y)`. Sul complesso usa
 * solo la parte reale degli argomenti (comportamento "silenzioso", §6 dell'inventario). */
export function atan2(y: NumbasNumber, x: NumbasNumber): number {
  const yn = isComplex(y) ? y.re : (y as number);
  const xn = isComplex(x) ? x.re : (x as number);
  return Math.atan2(yn, xn);
}

// math.js:1611-1617
/** Seno iperbolico. */
export function sinh(x: NumbasNumber): NumbasNumber {
  if (isComplex(x)) {
    return div(sub(exp(x), exp(negate(x))), 2);
  } else {
    return (Math.exp(x as number) - Math.exp(-(x as number))) / 2;
  }
}

// math.js:1623-1629
/** Coseno iperbolico. */
export function cosh(x: NumbasNumber): NumbasNumber {
  if (isComplex(x)) {
    return div(add(exp(x), exp(negate(x))), 2);
  } else {
    return (Math.exp(x as number) + Math.exp(-(x as number))) / 2;
  }
}

// math.js:1635-1637
/** Tangente iperbolica. */
export function tanh(x: NumbasNumber): NumbasNumber {
  return div(sinh(x), cosh(x));
}

// math.js:1643-1645
/** Cosecante iperbolica. */
export function cosech(x: NumbasNumber): NumbasNumber {
  return div(1, sinh(x));
}

// math.js:1651-1653
/** Secante iperbolica. */
export function sech(x: NumbasNumber): NumbasNumber {
  return div(1, cosh(x));
}

// math.js:1659-1661
/** Cotangente iperbolica. */
export function coth(x: NumbasNumber): NumbasNumber {
  return div(1, tanh(x));
}

// math.js:1667-1673
/** Arcoseno iperbolico. */
export function arcsinh(x: NumbasNumber): NumbasNumber {
  if (isComplex(x)) {
    return log(add(x, sqrt(add(mul(x, x), 1))));
  } else {
    return Math.log((x as number) + Math.sqrt((x as number) * (x as number) + 1));
  }
}

// math.js:1679-1685
/** Arcocoseno iperbolico. */
export function arccosh(x: NumbasNumber): NumbasNumber {
  if (isComplex(x)) {
    return log(add(x, sqrt(sub(mul(x, x), 1))));
  } else {
    return Math.log((x as number) + Math.sqrt((x as number) * (x as number) - 1));
  }
}

// math.js:1691-1697
/** Arcotangente iperbolica. */
export function arctanh(x: NumbasNumber): NumbasNumber {
  if (isComplex(x)) {
    return div(log(div(add(1, x), sub(1, x))), 2);
  } else {
    return 0.5 * Math.log((1 + (x as number)) / (1 - (x as number)));
  }
}
