/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-rules.js:2109-2294 — il catalogo delle regole di semplificazione, la
// funzione che le compila e il bootstrap che costruisce i `Ruleset`.
//
// Le stringhe dei pattern e dei risultati sono copiate alla lettera
// dall'upstream, commenti compresi. NON è portato il blocco di 17 regole
// commentate dopo `collectLikeFractions` (jme-rules.js:2207-2227): è codice
// morto (inventario §8.5, DIVERGENCES.md).

import * as math from "../math";
import { Ruleset } from "./rules-ruleset";
import { Rule } from "./rules-transform";
import { substituteTree } from "./evaluate";
import { Scope } from "./scope";
import { TNum, type Tree } from "./tokens";
import { normaliseRulesetName } from "./util";

/** Una regola nella forma sorgente: pattern, opzioni, risultato. */
export type RuleSource = [string, string, string];

// jme-rules.js:2109-2206
/** Le regole di semplificazione predefinite, nella forma sorgente. */
const simplificationRulesSource: Record<string, RuleSource[]> = {
  basic: [
    ["negative:$n;x", "", "-eval(-x)"],       // The value of a number token should be non-negative - pull the negation out as unary minus
    ["+(?;x)", "s", "x"],                     // Get rid of unary plus
    ["?;x+(-?;y)", "ags", "x-y"],             // Plus minus = minus
    ["?;x-(-?;y)", "ags", "x+y"],             // Minus minus = plus
    ["-(-?;x)", "s", "x"],                    // Unary minus minus = plus
    ["(-?;x)/?;y", "s", "-(x/y)"],            // Take negation to the left of a fraction
    ["?;x/(-?;y)", "s", "-(x/y)"],
    ["-(`! complex:$n);x * (-?;y)", "asg", "x*y"], // Cancel the product of two negated things that aren't complex numbers
    ["`!-? `& (-(real:$n/real:$n`? `| imaginary:$n `| `!$n);x) * ?`+;y", "sgc", "-(x*y)"],            // Take negation to the left of multiplication
    ["imaginary:$n;z * ?;y `where im(z)<0", "acsg", "-(eval(-z)*y)"], // Pull negation out of products involving negative imaginary numbers
    ["-(?;a+?`+;b)", "", "-a-b"],             // Expand negated brackets
    ["?;a+(-?;b-?;c)", "", "a-b-c"],          // Remove brackets involving subtraction
    ["?;a+(-?;b+?;c)", "", "a-b+c"],          // Remove brackets involving subtraction
    ["?;a/?;b/?;c", "", "a/(b*c)"]            // Prefer a product on the denominator to a string of divisions
  ],
  collectComplex: [
    ["-complex:negative:$n;x", "", "eval(-x)"],   // Cancel negation of a complex number with negative real part
    ["(`+- real:$n);x + (`+- imaginary:$n);y", "cg", "eval(x+y)"],    // Collect the two parts of a complex number
    ["$n;n*i", "acsg", "eval(n*i)"],            // Always collect multiplication by i
  ],
  unitFactor: [
    ["1*(`! (/?));x", "acgs", "x"],
  ],
  unitPower: [
    ["?;x^1", "", "x"]
  ],
  unitDenominator: [
    ["?;x/1", "", "x"]
  ],
  zeroFactor: [
    ["?;x*0", "acg", "0"],
    ["0/?;x", "", "0"]
  ],
  zeroTerm: [
    ["(`+-0) + (`+- ?);x", "acg", "x"]
  ],
  zeroPower: [
    ["?;x^0", "", "1"]
  ],
  powerPower: [
    ["(?;x^$n;a)^$n;b `where abs(a*b)<infinity", "", "x^eval(a*b)"]
  ],
  noLeadingMinus: [
    ["-?;x + ?;y", "s", "y-x"],   // Don't start with a unary minus
    ["-0", "", "0"]               // Cancel negative 0
  ],
  collectNumbers: [
    ["$n;a * (1/?;b)", "ags", "a/b"],
    ["(`+- $n);n1 + (`+- $n)`+;n2 `where abs(n1+n2)<infinity", "acg", "eval(n1+n2)"],                // Addition of two numbers
    ["$n;n * $n;m `where abs(n*m)<infinity", "acg", "eval(n*m)"],                                  // Product of two numbers
    ["(`! $n)`+;x * real:$n;n * ((`! $n )`* `| $z);y", "ags", "n*x*y"]    // Shift numbers to left hand side of multiplication
  ],
  simplifyFractions: [
    ["($n;n * (?`* `: 1);top) / ($n;m * (?`* `: 1);bottom) `where gcd_without_pi_or_i(n,m)>1", "acg", "(eval(n/gcd_without_pi_or_i(n,m))*top)/(eval(m/gcd_without_pi_or_i(n,m))*bottom)"],    // Cancel common factors of integers on top and bottom of a fraction
    ["imaginary:$n;n / imaginary:$n;m", "", "eval(n/i)/eval(m/i)"],            // Cancel i when numerator and denominator are both purely imaginary
    ["?;=a / ?;=a", "acg", "1"],              // Cancel fractions equal to 1
    ["?;a / (?;b/?;c * ?`*;rest)", "acg", "(a*c)/(b * rest)"]     // Un-nest nested fractions
  ],
  zeroBase: [
    ["0^?;x", "", "0"]
  ],
  constantsFirst: [
    ["(`! `+- $n);x * (real:$n/real:$n`?);n", "asg", "n*x"]
  ],
  sqrtProduct: [
    ["sqrt(?;x)*sqrt(?;y)", "agc", "sqrt(x*y)"]
  ],
  sqrtDivision: [
    ["sqrt(?;x)/sqrt(?;y)", "agc", "sqrt(x/y)"]
  ],
  sqrtSquare: [
    ["sqrt(?;x^2)", "", "x"],
    ["sqrt(?;x)^2", "", "x"],
    ["sqrt(integer:$n;n) `where isint(sqrt(n))", "", "eval(sqrt(n))"] // Cancel square root of a square integer
  ],
  trig: [
    ["sin($n;n) `where isint(2*n/pi)", "", "eval(sin(n))"],   // Evaluate sin on multiples of pi/2
    ["cos($n;n) `where isint(2*n/pi)", "", "eval(cos(n))"],   // Evaluate cos on multiples of pi/2
    ["tan($n;n) `where isint(n/pi)", "", "0"],                // Evaluate tan on multiples of pi
    ["cosh(0)", "", "1"],
    ["sinh(0)", "", "0"],
    ["tanh(0)", "", "0"]
  ],
  otherNumbers: [
    ["(`+-$n);n ^ $n;m `where abs(n^m)<infinity", "", "eval(n^m)"]
  ],
  cancelTerms: [
    ['["term": `!$n] `@ (m_exactly((`+- $n `: 1);n * (?`+ `& `! -? `& term);=x `| -term;=x;n:-1) + m_exactly((`+- $n `: 1);m * (?`+ `& `! -? `& term);=x `| -term;=x;m:-1))', "acg", "eval(n+m)*x"]
  ],
  cancelFactors: [
    ["?;=x^(? `: 1);n * ?;=x^(? `: 1);m", "acg", "x^(m+n)"],
    ["?;=x^(? `: 1);n / ?;=x^(? `: 1);m", "acg", "x^(n-m)"]
  ],
  collectLikeFractions: [
    ["(?`+);a/?;=d + `+- (?`+);b/?;=d", "acg", "(a+b)/d"]
  ]
};

// jme-rules.js:2233-2256
/** Insiemi di regole che confliggono con alcune di `simplificationRules`, o
 * che comunque non vanno attivate sempre: non entrano in `all`
 * (inventario §8.4). */
const conflictingSimplificationRulesSource: Record<string, RuleSource[]> = {
  // these rules conflict with noLeadingMinus
  canonicalOrder: [
    ["(`+- ?);x+(`+- ?);y `where canonical_compare(x,y)=1", "ag", "y+x"],
    ["?;x*?;y `where canonical_compare(x,y)=-1", "ag", "y*x"],
  ],
  expandBrackets: [
    ["(?;x + ((`+- ?)`+);y) * ?;z", "ag", "x*z+y*z"],
    ["?;x * (?;y + ((`+- ?)`+);z)", "ag", "x*y+x*z"]
  ],
  noDivision: [
    ["?;top/(?;base^(?`? `: 1);degree)", "", "top * base^(-degree)"]
  ],
  rationalDenominators: [
    ["?;a/(sqrt(?;surd)*?`*;rest)", "acg", "(a*sqrt(surd))/(surd*rest)"],
  ],
  reduceSurds: [
    ["sqrt((`+-$n);n * (?`* `: 1);rest) `where abs(largest_square_factor(n))>1", "acg", "eval(sqrt(abs(largest_square_factor(n))))*sqrt(eval(n/abs(largest_square_factor(n))) * rest)"],
    ["sqrt((?;a)^(`+-$n;n) * (?`* `: 1);rest) `where abs(n)>1", "acg", "a^eval(trunc(n/2)) * sqrt(a^eval(mod(n,2))*rest)"]
  ],
  collectIntegerFactors: [
    ["`+-$n;a1*?;b1 + `+-$n;a2*?`?;b2 `where abs(a1) > 0 and abs(a2) > 0 and gcd(a1,a2) > 1", "acg", "eval(gcd(a1,a2))*(eval(a1/gcd(a1,2))*b1+eval(a2/gcd(a1,a2))*b2)"]
  ]
};

// jme-rules.js:2265-2273 — upstream sostituisce le voci dell'array sorgente
// con gli oggetti `Rule`; qui l'array sorgente resta intatto e se ne costruisce
// uno nuovo (l'effetto è lo stesso: nessuno rilegge la forma sorgente).
/** Compila un array di regole `[pattern, opzioni, risultato]` in un
 * `Ruleset`. */
export function compileRules(rules: RuleSource[], name?: string): Ruleset {
  return new Ruleset(
    rules.map((r) => new Rule(r[0], r[2], r[1], name)),
    {},
  );
}

// jme-rules.js:2274-2293 — il bootstrap: si compila ogni insieme (registrandolo
// sia col nome originale sia in minuscolo), si costruisce `all` con le sole
// regole di `simplificationRules`, e si sostituiscono le costanti `i` e `pi`
// nei pattern e nei risultati.
const compiledSimplificationRules: Record<string, Ruleset> = {};
const compiledConflictingRules: Record<string, Ruleset> = {};
let all: Rule[] = [];
const subscope = new Scope();
subscope.setConstant("i", { value: new TNum(math.complex(0, 1) as math.Complex) });
subscope.setConstant("pi", { value: new TNum(Math.PI) });
for (const [name, rule] of Object.entries(simplificationRulesSource)) {
  const set = compileRules(rule, name);
  compiledSimplificationRules[name] = set;
  compiledSimplificationRules[normaliseRulesetName(name)] = set;
  all = all.concat(set.rules);
}
for (const [name, rule] of Object.entries(conflictingSimplificationRulesSource)) {
  const set = compileRules(rule, name);
  compiledSimplificationRules[name] = set;
  compiledSimplificationRules[normaliseRulesetName(name)] = set;
  compiledConflictingRules[name] = set;
}
Object.values(compiledSimplificationRules).forEach((set) => {
  set.rules.forEach((rule) => {
    rule.pattern = substituteTree(rule.pattern, subscope, true) as Tree;
    rule.result = substituteTree(rule.result, subscope, true);
  });
});
compiledSimplificationRules["all"] = new Ruleset(all, {});

/** Le regole di semplificazione predefinite: 22 insiemi (registrati sia col
 * nome originale sia in minuscolo), i 6 in conflitto e l'insieme sintetico
 * `all`. */
export const simplificationRules: Record<string, Ruleset> = compiledSimplificationRules;

/** I 6 insiemi che confliggono con quelli di base: vanno chiesti per nome,
 * `all` non li include. */
export const conflictingSimplificationRules: Record<string, Ruleset> = compiledConflictingRules;
