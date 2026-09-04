/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-display.js:151-858 — le opzioni lette dai token (`number_options`,
// `string_options`), gli helper di fabbrica per il TeX e i quattro dizionari
// statici del `Texifier`: `texOps` (91 voci), `texNameAnnotations` (20 voci
// più 3 alias), `specialNames`, `typeToTeX` (19 voci); in coda `flatten`
// (843-858), che serve a entrambi i renderer.
//
// Le voci sono nell'ordine dell'upstream. Le funzioni dei dizionari sono
// chiamate con `.call(this, ...)` da `Texifier`, quindi dichiarano `this`.
//
// `Numbas.locale.default_list_separator` (10 usi upstream) non ha equivalente
// qui: il motore non ha globali di FORMATO (vedi DIVERGENCES.md), quindi il
// separatore è sempre `,`, in tutte le lingue. La lingua dei messaggi esiste,
// ma viaggia sullo scope (`Scope.locale`) e non tocca la resa dei numeri.

import * as math from "../math";
// jme-display.js:187 — `const {isComplex, isNegative, hasRealPart, conjugate,
// negated} = jme`. `isComplex` di `jme/evaluate.ts` si chiama come quello di
// `math/`, quindi qui si rinomina.
import {
  castToType,
  conjugate,
  hasRealPart,
  isComplex as isComplexTok,
  isOp,
  isType,
} from "./evaluate";
import { precedence } from "./tokenizer";
import {
  TDecimal,
  TKeyPair,
  type Token,
  type Tree,
  type TName,
  type TFunc,
  type TOp,
} from "./tokens";
// import di solo tipo: non crea un ciclo a runtime (`display-texifier.ts`
// importa questo modulo, non viceversa).
import type { Texifier } from "./display-texifier";

/** Il separatore di lista: upstream `Numbas.locale.default_list_separator`. */
export const LIST_SEPARATOR = ",";

/** Le opzioni di formattazione numerica lette da un token, più
 * `store_precision`, che `math.niceNumber` non conosce ma il `JMEifier` sì. */
export type DisplayNumberOptions = math.NiceNumberOptions & { store_precision?: boolean };

// jme-display.js:151-165
/** Le opzioni per `math.niceNumber` di un dato token. */
export function number_options(tok: Token): DisplayNumberOptions {
  const t = tok as { precisionType?: "dp" | "sigfig"; precision?: number };
  const options: DisplayNumberOptions = {};
  // upstream scrive sempre le due chiavi, anche a `undefined`: qui si
  // omettono, che è indistinguibile per tutti i consumatori.
  if (t.precisionType !== undefined) {
    options.precisionType = t.precisionType;
  }
  if (t.precision !== undefined) {
    options.precision = t.precision;
  }
  if (tok.type === "integer" || tok.type === "rational") {
    options.store_precision = false;
  }
  return options;
}

/** Le opzioni di resa di un token stringa. */
export interface StringOptions {
  /** La stringa è codice LaTeX. */
  latex?: boolean | undefined;
  /** La stringa è "sicura": niente escape dei caratteri speciali. */
  safe?: boolean | undefined;
}

// jme-display.js:167-185
/** Le opzioni di resa di un token stringa. */
export function string_options(tok: Token): StringOptions {
  const t = tok as { latex?: boolean; safe?: boolean };
  return { latex: t.latex, safe: t.safe };
}

/** Una voce di `texOps`: riceve l'albero e il TeX già reso dei suoi
 * argomenti. `code` è impostato da `funcTex` e riletto da `texOps['^']`. */
export type TexOpFn = ((this: Texifier, tree: Tree, texArgs: string[]) => string) & { code?: string };

/** Una voce di `typeToTeX`: riceve l'albero, il token in cima e il TeX degli
 * argomenti (assente per i token senza figli). */
export type TypeToTexFn = (this: Texifier, tree: Tree, tok: Token, texArgs?: string[]) => string;

// jme-display.js:189-207
/** Il TeX di un operatore infisso (o prefisso/postfisso, se unario). */
function infixTex(code: string): TexOpFn {
  return function (tree, texArgs) {
    const arity = (tree.args as Tree[]).length;
    if (arity === 1) {
      const arg = this.texifyOpArg(tree, texArgs, 0);
      return (tree.tok as TOp).postfix ? arg + code : code + arg;
    } else if (arity === 2) {
      return this.texifyOpArg(tree, texArgs, 0) + " " + code + " " + this.texifyOpArg(tree, texArgs, 1);
    }
    // upstream non ritorna niente per le altre arità
    return undefined as unknown as string;
  };
}

// jme-display.js:209-219
/** Il TeX (costante) di una funzione senza argomenti. */
function nullaryTex(code: string): TexOpFn {
  return function () {
    return "\\textrm{" + code + "}";
  };
}

// jme-display.js:221-234
/** Il TeX di una funzione: `code \left ( arg, arg \right )`. */
function funcTex(code: string): TexOpFn {
  const f: TexOpFn = function (tree, texArgs) {
    return code + " \\left ( " + texArgs.join(LIST_SEPARATOR + " ") + " \\right )";
  };
  f.code = code;
  return f;
}

// jme-display.js:236-243
/** Il nome di un operatore di pattern-matching. */
function patternName(code: string): string {
  return "\\operatorname{\\color{grey}{" + code + "}}";
}

// jme-display.js:245-274
/** Il TeX di un più o meno unario. Se l'argomento è già un numero complesso,
 * ne nega direttamente `re`/`im` invece di anteporre il segno. */
function texUnaryAdditionOrMinus(symbol: "+" | "-"): TexOpFn {
  return function (tree, texArgs) {
    let tex = texArgs[0] as string;
    const arg = (tree.args as Tree[])[0] as Tree;
    if (arg.tok.type === "op") {
      const op = (arg.tok as TOp).name;
      if (
        op === "-u" ||
        op === "+u" ||
        // servono le parentesi se l'argomento è un'operazione che verrebbe
        // valutata dopo l'operatore unario
        (!(op === "/" || op === "*") && (precedence[op] as number) > (precedence[symbol + "u"] as number))
      ) {
        tex = "\\left ( " + tex + " \\right )";
      }
    } else if (isComplexTok(arg.tok)) {
      const tok = arg.tok;
      switch (tok.type) {
        case "number": {
          const value = tok.value as math.Complex;
          return this.number(math.complex(-value.re, -value.im), number_options(tok));
        }
        case "decimal":
          return this.number(tok.value.negated().toComplexNumber(), number_options(tok));
      }
    }
    return symbol + tex;
  };
}

// jme-display.js:276-625
/** Come rendere in TeX ciascun operatore e funzione. */
export const texOps: Record<string, TexOpFn> = {
  "#": function (tree, texArgs) {
    return texArgs[0] + " \\, \\# \\, " + texArgs[1];
  },
  not: infixTex("\\neg "),
  "+u": texUnaryAdditionOrMinus("+"),
  "-u": texUnaryAdditionOrMinus("-"),
  "^": function (tree, texArgs) {
    let tex0 = texArgs[0] as string;
    const args = tree.args as Tree[];
    const a0 = args[0] as Tree;
    // se l'operando sinistro è un'operazione servono le parentesi.
    // L'elevamento è associativo a destra, quindi 2^3^4 non ne prende, (2^3)^4 sì.
    if (
      a0.tok.type === "op" ||
      (a0.tok.type === "function" && (a0.tok as TFunc).name === "exp") ||
      this.texifyWouldBracketOpArg(tree, 0)
    ) {
      tex0 = "\\left ( " + tex0 + " \\right )";
    }
    const trigFunctions = [
      "cos",
      "sin",
      "tan",
      "sec",
      "cosec",
      "cot",
      "arcsin",
      "arccos",
      "arctan",
      "cosh",
      "sinh",
      "tanh",
      "cosech",
      "sech",
      "coth",
      "arccosh",
      "arcsinh",
      "arctanh",
    ];
    const a1 = args[1] as Tree;
    if (
      a0.tok.type === "function" &&
      trigFunctions.includes((a0.tok as TFunc).name) &&
      isType(a1.tok, "number") &&
      math.isInt((a1.tok as { value: unknown }).value) &&
      ((a1.tok as { value: number }).value as number) > 0
    ) {
      return (
        (texOps[(a0.tok as TFunc).name] as TexOpFn).code +
        "^{" +
        texArgs[1] +
        "}" +
        "\\left( " +
        this.render((a0.args as Tree[])[0] as Tree) +
        " \\right)"
      );
    }
    return tex0 + "^{ " + texArgs[1] + " }";
  },
  "*": function (tree, texArgs) {
    const args = tree.args as Tree[];
    let s = this.texifyOpArg(tree, texArgs, 0);
    for (let i = 1; i < args.length; i++) {
      const left = args[i - 1] as Tree;
      const right = args[i] as Tree;
      let use_symbol = false;
      if (this.settings.alwaystimes) {
        use_symbol = true;
      } else {
        if (this.texifyWouldBracketOpArg(tree, i - 1) && this.texifyWouldBracketOpArg(tree, i)) {
          use_symbol = false;
          // due cifre adiacenti ma di argomenti diversi: serve il simbolo
        } else if (
          math.isInt((texArgs[i - 1] as string).charAt((texArgs[i - 1] as string).length - 1)) &&
          math.isInt((texArgs[i] as string).charAt(0)) &&
          !this.texifyWouldBracketOpArg(tree, i)
        ) {
          use_symbol = true;
          // numero reale per qualcosa che non inizia con una cifra o un meno
        } else if (isType(left.tok, "number") && !isComplexTok(left.tok) && /^[^\-+0-9]/.test(texArgs[i] as string)) {
          use_symbol = false;
          // numero per una potenza di i
        } else if (
          isOp(right.tok, "^") &&
          isType(((right.args as Tree[])[0] as Tree).tok, "number") &&
          math.eq(
            (((right.args as Tree[])[0] as Tree).tok as { value: math.NumbasNumber }).value,
            math.complex(0, 1),
          ) &&
          isType(left.tok, "number")
        ) {
          use_symbol = false;
          // simbolo per quando uno dei due membri è un fattoriale
        } else if (
          (left.tok.type === "function" && (left.tok as TFunc).name === "fact") ||
          (right.tok.type === "function" && (right.tok as TFunc).name === "fact")
        ) {
          use_symbol = true;
          // (qualsiasi cosa tranne i) per i
        } else if (
          !(
            isType(left.tok, "number") &&
            math.eq((castToType(left.tok, "number") as { value: math.NumbasNumber }).value, math.complex(0, 1))
          ) &&
          isType(right.tok, "number") &&
          math.eq((castToType(right.tok, "number") as { value: math.NumbasNumber }).value, math.complex(0, 1))
        ) {
          use_symbol = false;
          // prodotto di due nomi, di cui almeno uno di più lettere
        } else if (
          right.tok.type === "name" &&
          left.tok.type === "name" &&
          Math.max((left.tok as TName).nameInfo.letterLength, (right.tok as TName).nameInfo.letterLength) > 1
        ) {
          use_symbol = true;
          // prodotto di un nome per qualcosa fra parentesi
        } else if (isType(left.tok, "name") && this.texifyWouldBracketOpArg(tree, i)) {
          use_symbol = true;
          // qualsiasi cosa per un numero, o per (-qualcosa), o per un
          // operatore di precedenza minore di `*` il cui primo argomento è un numero
        } else if (
          isType(right.tok, "number") ||
          (right.tok.type === "op" &&
            (precedence[(right.tok as TOp).name] as number) <= (precedence["*"] as number) &&
            /^\d/.test(texArgs[i] as string))
        ) {
          use_symbol = true;
        }
      }
      s += use_symbol ? " " + this.texTimesSymbol() + " " : " ";
      s += this.texifyOpArg(tree, texArgs, i);
    }
    return s;
  },
  "/": function (tree, texArgs) {
    if (this.settings.flatfractions) {
      return (
        "\\left. " +
        this.texifyOpArg(tree, texArgs, 0) +
        " \\middle/ " +
        this.texifyOpArg(tree, texArgs, 1) +
        " \\right."
      );
    } else {
      return "\\frac{ " + texArgs[0] + " }{ " + texArgs[1] + " }";
    }
  },
  "+": function (tree, texArgs) {
    const b = (tree.args as Tree[])[1] as Tree;
    if (isOp(b.tok, "+u") || isOp(b.tok, "-u")) {
      return texArgs[0] + " + \\left ( " + texArgs[1] + " \\right )";
    } else {
      return texArgs[0] + " + " + texArgs[1];
    }
  },
  "-": function (tree, texArgs) {
    const b = (tree.args as Tree[])[1] as Tree;
    if (isComplexTok(b.tok) && hasRealPart(b.tok)) {
      const texb = this.number(conjugate(b.tok), number_options(b.tok));
      return texArgs[0] + " - " + texb;
    } else {
      if (isOp(b.tok, "+") || isOp(b.tok, "-") || isOp(b.tok, "+u") || isOp(b.tok, "-u")) {
        return texArgs[0] + " - \\left ( " + texArgs[1] + " \\right )";
      } else {
        return texArgs[0] + " - " + texArgs[1];
      }
    }
  },
  dot: infixTex("\\cdot"),
  cross: infixTex("\\times"),
  transpose: function (tree, texArgs) {
    let tex = texArgs[0] as string;
    if (((tree.args as Tree[])[0] as Tree).tok.type === "op") {
      tex = "\\left ( " + tex + " \\right )";
    }
    return tex + "^{\\mathrm{T}}";
  },
  "..": infixTex("\\dots"),
  except: infixTex("\\operatorname{except}"),
  "<": infixTex("\\lt"),
  ">": infixTex("\\gt"),
  "<=": infixTex("\\leq"),
  ">=": infixTex("\\geq"),
  "<>": infixTex("\\neq"),
  "=": infixTex("="),
  and: infixTex("\\wedge"),
  or: infixTex("\\vee"),
  nand: infixTex("\\operatorname{NAND}"),
  nor: infixTex("\\operatorname{NOR}"),
  xor: infixTex("\\operatorname{XOR}"),
  implies: infixTex("\\implies"),
  in: infixTex("\\in"),
  "|": infixTex("|"),
  decimal: function (tree, texArgs) {
    const a0 = (tree.args as Tree[])[0] as Tree;
    if (isType(a0.tok, "string")) {
      const s = (castToType(a0.tok, "string") as { value: string }).value;
      const t = new TDecimal(new math.Decimal(s));
      t.precisionType = "dp";
      t.precision = math.countDP(s);
      return (this.typeToTeX["decimal"] as TypeToTexFn).call(this, { tok: t }, t);
    }
    return texArgs[0] as string;
  },
  abs: function (tree, texArgs) {
    let arg: string;
    const a0 = (tree.args as Tree[])[0] as Tree;
    if (a0.tok.type === "vector") {
      arg = this.texVector(a0.tok.value, number_options(a0.tok));
    } else if (a0.tok.type === "function" && (a0.tok as TFunc).name === "vector") {
      arg = this.texVector(a0);
    } else if (a0.tok.type === "matrix") {
      arg = this.texMatrix(a0.tok.value, false, number_options(a0.tok));
    } else if (a0.tok.type === "function" && (a0.tok as TFunc).name === "matrix") {
      arg = this.texMatrix(a0, false);
    } else {
      arg = texArgs[0] as string;
    }
    return "\\left | " + arg + " \\right |";
  },
  sqrt: function (tree, texArgs) {
    return "\\sqrt{ " + texArgs[0] + " }";
  },
  exp: function (tree, texArgs) {
    if (this.common_constants.e) {
      return this.common_constants.e.tex + "^{ " + texArgs[0] + " }";
    } else {
      return funcTex("\\exp").call(this, tree, texArgs);
    }
  },
  fact: function (tree, texArgs) {
    const a0 = (tree.args as Tree[])[0] as Tree;
    if (isType(a0.tok, "number") || a0.tok.type === "name") {
      return texArgs[0] + "!";
    } else {
      return "\\left (" + texArgs[0] + " \\right )!";
    }
  },
  ceil: function (tree, texArgs) {
    return "\\left \\lceil " + texArgs[0] + " \\right \\rceil";
  },
  floor: function (tree, texArgs) {
    return "\\left \\lfloor " + texArgs[0] + " \\right \\rfloor";
  },
  int: function (tree, texArgs) {
    return "\\int \\! " + texArgs[0] + " \\, \\mathrm{d}" + texArgs[1];
  },
  defint: function (tree, texArgs) {
    return "\\int_{" + texArgs[2] + "}^{" + texArgs[3] + "} \\! " + texArgs[0] + " \\, \\mathrm{d}" + texArgs[1];
  },
  diff: function (tree, texArgs) {
    const args = tree.args as Tree[];
    const degree = diffDegree(args, texArgs);
    if ((args[0] as Tree).tok.type === "name") {
      if (this.settings.flatfractions) {
        return (
          "\\left. \\mathrm{d}" +
          degree +
          this.texifyOpArg(tree, texArgs, 0) +
          " \\middle/ \\mathrm{d}" +
          this.texifyOpArg(tree, texArgs, 1) +
          "\\right."
        );
      } else {
        return "\\frac{\\mathrm{d}" + degree + texArgs[0] + "}{\\mathrm{d}" + texArgs[1] + degree + "}";
      }
    } else {
      if (this.settings.flatfractions) {
        return (
          "\\left. \\mathrm{d}" +
          degree +
          "(" +
          texArgs[0] +
          ") \\middle/ \\mathrm{d}" +
          this.texifyOpArg(tree, texArgs, 1) +
          "\\right."
        );
      } else {
        return (
          "\\frac{\\mathrm{d}" + degree + "}{\\mathrm{d}" + texArgs[1] + degree + "} \\left (" + texArgs[0] + " \\right )"
        );
      }
    }
  },
  partialdiff: function (tree, texArgs) {
    const args = tree.args as Tree[];
    const degree = diffDegree(args, texArgs);
    if ((args[0] as Tree).tok.type === "name") {
      if (this.settings.flatfractions) {
        return (
          "\\left. \\partial " +
          degree +
          this.texifyOpArg(tree, texArgs, 0) +
          " \\middle/ \\partial " +
          this.texifyOpArg(tree, texArgs, 1) +
          "\\right."
        );
      } else {
        return "\\frac{\\partial " + degree + texArgs[0] + "}{\\partial " + texArgs[1] + degree + "}";
      }
    } else {
      if (this.settings.flatfractions) {
        return (
          "\\left. \\partial " +
          degree +
          "(" +
          texArgs[0] +
          ") \\middle/ \\partial " +
          this.texifyOpArg(tree, texArgs, 1) +
          "\\right."
        );
      } else {
        return (
          "\\frac{\\partial " + degree + "}{\\partial " + texArgs[1] + degree + "} \\left (" + texArgs[0] + " \\right )"
        );
      }
    }
  },
  sub: function (tree, texArgs) {
    return texArgs[0] + "_{ " + texArgs[1] + " }";
  },
  sup: function (tree, texArgs) {
    return texArgs[0] + "^{ " + texArgs[1] + " }";
  },
  limit: function (tree, texArgs) {
    return "\\lim_{" + texArgs[1] + " \\to " + texArgs[2] + "}{" + texArgs[0] + "}";
  },
  mod: function (tree, texArgs) {
    return texArgs[0] + " \\pmod{" + texArgs[1] + "}";
  },
  perm: function (tree, texArgs) {
    return "^{" + texArgs[0] + "}\\kern-2pt P_{" + texArgs[1] + "}";
  },
  comb: function (tree, texArgs) {
    return "^{" + texArgs[0] + "}\\kern-1pt C_{" + texArgs[1] + "}";
  },
  root: function (tree, texArgs) {
    const a1 = (tree.args as Tree[])[1] as Tree;
    if (isType(a1.tok, "number")) {
      const n = (castToType(a1.tok, "number") as { value: number }).value;
      if (n === 2) {
        return "\\sqrt{ " + texArgs[0] + " }";
      }
    }
    return "\\sqrt[" + texArgs[1] + "]{ " + texArgs[0] + " }";
  },
  if: function (tree, texArgs) {
    for (let i = 0; i < 3; i++) {
      if (((tree.args as Tree[])[i] as Tree).args !== undefined) {
        texArgs[i] = "\\left ( " + texArgs[i] + " \\right )";
      }
    }
    return (
      "\\textbf{If} \\; " +
      texArgs[0] +
      " \\; \\textbf{then} \\; " +
      texArgs[1] +
      " \\; \\textbf{else} \\; " +
      texArgs[2]
    );
  },
  switch: funcTex("\\operatorname{switch}"),
  gcd: funcTex("\\operatorname{gcd}"),
  lcm: funcTex("\\operatorname{lcm}"),
  trunc: funcTex("\\operatorname{trunc}"),
  fract: funcTex("\\operatorname{fract}"),
  degrees: funcTex("\\operatorname{degrees}"),
  radians: funcTex("\\operatorname{radians}"),
  round: funcTex("\\operatorname{round}"),
  sign: funcTex("\\operatorname{sign}"),
  random: funcTex("\\operatorname{random}"),
  max: funcTex("\\operatorname{max}"),
  min: funcTex("\\operatorname{min}"),
  precround: funcTex("\\operatorname{precround}"),
  siground: funcTex("\\operatorname{siground}"),
  award: funcTex("\\operatorname{award}"),
  hour24: nullaryTex("hour24"),
  hour: nullaryTex("hour"),
  ampm: nullaryTex("ampm"),
  minute: nullaryTex("minute"),
  second: nullaryTex("second"),
  msecond: nullaryTex("msecond"),
  dayofweek: nullaryTex("dayofweek"),
  sin: funcTex("\\sin"),
  cos: funcTex("\\cos"),
  tan: funcTex("\\tan"),
  sec: funcTex("\\sec"),
  cot: funcTex("\\cot"),
  cosec: funcTex("\\csc"),
  arccos: funcTex("\\arccos"),
  arcsin: funcTex("\\arcsin"),
  arctan: funcTex("\\arctan"),
  cosh: funcTex("\\cosh"),
  sinh: funcTex("\\sinh"),
  tanh: funcTex("\\tanh"),
  coth: funcTex("\\coth"),
  cosech: funcTex("\\operatorname{cosech}"),
  sech: funcTex("\\operatorname{sech}"),
  arcsinh: funcTex("\\operatorname{arcsinh}"),
  arccosh: funcTex("\\operatorname{arccosh}"),
  arctanh: funcTex("\\operatorname{arctanh}"),
  ln: function (tree, texArgs) {
    const a0 = (tree.args as Tree[])[0] as Tree;
    if (a0.tok.type === "function" && (a0.tok as TFunc).name === "abs") {
      return "\\ln " + texArgs[0];
    } else {
      return "\\ln \\left ( " + texArgs[0] + " \\right )";
    }
  },
  log: function (tree, texArgs) {
    const base = (tree.args as Tree[]).length === 1 ? "10" : texArgs[1];
    return "\\log_{" + base + "} \\left ( " + texArgs[0] + " \\right )";
  },
  vector: function (tree) {
    return "\\left ( " + this.texVector(tree) + " \\right )";
  },
  rowvector: function (tree) {
    // upstream (jme-display.js:571-573) costruisce qui un albero finto senza
    // `tok`: `texMatrix` ci inciampa e lancia un TypeError. Riprodotto tale
    // e quale (upstream `exprToLaTeX('rowvector(1,2)')` lancia).
    if (((tree.args as Tree[])[0] as Tree).tok.type !== "list") {
      return this.texMatrix(
        { args: [{ args: tree.args }] } as unknown as Tree,
        true,
        number_options(tree.tok),
      );
    } else {
      return this.texMatrix(tree, true, number_options(tree.tok));
    }
  },
  matrix: function (tree) {
    return this.texMatrix(tree, !this.settings.barematrices, number_options(tree.tok));
  },
  listval: function (tree, texArgs) {
    return texArgs[0] + " \\left[" + texArgs[1] + "\\right]";
  },
  set: function (tree, texArgs) {
    const args = tree.args as Tree[];
    if (args.length === 1 && (args[0] as Tree).tok.type === "list") {
      const list = args[0] as Tree;
      const items: Tree[] = list.tok
        ? (list.args as Tree[])
        : ((list as unknown as { value: Token[] }).value.map((tok) => ({ tok })) as Tree[]);
      return (
        "\\left\\{ " + items.map((item) => this.render(item)).join(LIST_SEPARATOR + " ") + " \\right\\}"
      );
    } else {
      return "\\left\\{ " + texArgs.join(LIST_SEPARATOR + " ") + " \\right\\}";
    }
  },
  "`+-": infixTex(patternName("\\pm")),
  "`*/": infixTex(patternName("\\times \\atop \\div")),
  "`|": infixTex(patternName("|")),
  "`&": infixTex(patternName("\\wedge")),
  "`!": infixTex(patternName("\\neg")),
  "`where": infixTex(patternName("where")),
  "`@": infixTex(patternName("@")),
  "`?": unaryPatternTex(patternName("?")),
  "`*": unaryPatternTex(patternName("\\ast")),
  "`+": unaryPatternTex(patternName("+")),
  "`:": infixTex(patternName(":")),
  ";": function (tree, texArgs) {
    return "\\underset{\\color{grey}{" + texArgs[1] + "}}{" + texArgs[0] + "}";
  },
  ";=": function (tree, texArgs) {
    return "\\underset{\\color{grey}{=" + texArgs[1] + "}}{" + texArgs[0] + "}";
  },
  m_uses: funcTex(patternName("uses")),
  m_type: funcTex(patternName("type")),
  m_exactly: overbraceTex("exactly"),
  m_commutative: overbraceTex("commutative"),
  m_noncommutative: overbraceTex("non-commutative"),
  m_associative: overbraceTex("associative"),
  m_nonassociative: overbraceTex("non-associative"),
  m_strictplus: overbraceTex("strict-plus"),
  m_gather: overbraceTex("gather"),
  m_nogather: overbraceTex("no-gather"),
  m_func: funcTex(patternName("func")),
  m_op: funcTex(patternName("op")),
  m_numeric: overbraceTex("numeric ="),
};

// jme-display.js:449 e 465 — il grado della derivata, comune a `diff` e
// `partialdiff`.
/** L'esponente del grado di derivazione, vuoto quando è 1. */
function diffDegree(args: Tree[], texArgs: string[]): string {
  if (args.length < 2) {
    return "";
  }
  const a2 = args[2] as Tree;
  return isType(a2.tok, "number") && (castToType(a2.tok, "number") as { value: number }).value === 1
    ? ""
    : "^{" + texArgs[2] + "}";
}

// jme-display.js:627-635
/** Mette l'etichetta data sopra il primo argomento dell'operatore. */
function overbraceTex(label: string): TexOpFn {
  return function (tree, texArgs) {
    return "\\overbrace{" + texArgs[0] + "}^{\\text{" + label + "}}";
  };
}

// jme-display.js:637-647
/** Il TeX di un operatore unario di pattern-matching. */
function unaryPatternTex(code: string): TexOpFn {
  return function (tree, texArgs) {
    return "{" + texArgs[0] + "}^{" + code + "}";
  };
}

// jme-display.js:695-703
/** Un'annotazione che marca una proprietà, per il pattern-matching. */
function propertyAnnotation(text: string): (name: string) => string {
  return function (name) {
    return "\\text{" + text + " } " + name;
  };
}

// jme-display.js:649-693 + 705-707 (i tre alias)
/** Come rendere in TeX ciascuna annotazione di un nome. */
export const texNameAnnotations: Record<string, (name: string) => string> = {
  // serve ad aggirare cose come `i` ed `e` interpretate come costanti
  verbatim: function (name) {
    return name;
  },
  op: function (name) {
    return "\\operatorname{" + name + "}";
  },
  vector: function (name) {
    return "\\boldsymbol{" + name + "}";
  },
  // versore
  unit: function (name) {
    return "\\hat{" + name + "}";
  },
  // punto sopra
  dot: function (name) {
    return "\\dot{" + name + "}";
  },
  matrix: function (name) {
    return "\\mathrm{" + name + "}";
  },
  diff: function (name) {
    return "{\\mathrm{d}" + name + "}";
  },
  degrees: function (name) {
    return name + "^{\\circ}";
  },
  bb: function (name) {
    return "\\mathbb{" + name + "}";
  },
  complex: propertyAnnotation("complex"),
  imaginary: propertyAnnotation("imaginary"),
  real: propertyAnnotation("real"),
  positive: propertyAnnotation("positive"),
  nonnegative: propertyAnnotation("non-negative"),
  negative: propertyAnnotation("negative"),
  integer: propertyAnnotation("integer"),
  decimal: propertyAnnotation("decimal"),
  rational: propertyAnnotation("rational"),
  nonone: propertyAnnotation("nonone"),
  nonzero: propertyAnnotation("nonzero"),
};
texNameAnnotations["verb"] = texNameAnnotations["verbatim"] as (name: string) => string;
texNameAnnotations["v"] = texNameAnnotations["vector"] as (name: string) => string;
texNameAnnotations["m"] = texNameAnnotations["matrix"] as (name: string) => string;

// jme-display.js:709-716
/** Il TeX di un nome speciale del pattern-matching. */
function texPatternName(display: string): string {
  return "\\text{" + display + "}";
}

// jme-display.js:718-727
/** I nomi con una resa speciale. */
export const specialNames: Record<string, string> = {
  $z: texPatternName("nothing"),
  $n: texPatternName("number"),
  $v: texPatternName("name"),
};

// jme-display.js:729-842
/** Come rendere in TeX ciascun tipo di token. */
export const typeToTeX: Record<string, TypeToTexFn> = {
  nothing: function () {
    return "\\text{nothing}";
  },
  integer: function (tree, tok) {
    return this.number((tok as { value: math.NumbasNumber }).value, number_options(tok));
  },
  rational: function (tree, tok) {
    return this.number((tok as { value: math.Fraction }).value.toFloat(), number_options(tok));
  },
  decimal: function (tree, tok) {
    return this.decimal((tok as { value: math.ComplexDecimal }).value, number_options(tok));
  },
  number: function (tree, tok) {
    return this.number((tok as { value: math.NumbasNumber }).value, number_options(tok));
  },
  string: function (tree, tok) {
    const t = tok as { value: string; latex?: boolean; safe?: boolean };
    if (t.latex) {
      if (t.safe) {
        return t.value;
      } else {
        return t.value.replace(/\\([{}])/g, "$1").replace(/\$/g, "\\$");
      }
    } else {
      return "\\textrm{" + t.value + "}";
    }
  },
  boolean: function (tree, tok) {
    return (tok as { value: boolean }).value ? "true" : "false";
  },
  range: function (tree, tok) {
    const v = (tok as { value: math.Range }).value;
    return v[0] + " \\dots " + v[1];
  },
  list: function (tree, tok, texArgs) {
    const t = tok as { vars?: number; value?: Token[] };
    if (!texArgs) {
      texArgs = [];
      for (let i = 0; i < (t.vars as number); i++) {
        texArgs[i] = this.render({ tok: (t.value as Token[])[i] as Token });
      }
    }
    return "\\left[ " + texArgs.join(LIST_SEPARATOR + " ") + " \\right]";
  },
  keypair: function (tree, tok, texArgs) {
    const key = "\\textrm{" + (tok as { key: string }).key + "}";
    return key + " \\operatorname{\\colon} " + (texArgs as string[])[0];
  },
  dict: function (tree, tok, texArgs) {
    const t = tok as { value?: Record<string, Token> };
    if (!texArgs) {
      texArgs = [];
      if (t.value) {
        for (const key in t.value) {
          texArgs.push(this.render({ tok: new TKeyPair(key), args: [{ tok: t.value[key] as Token }] }));
        }
      }
    }
    return "\\left[ " + texArgs.join(LIST_SEPARATOR + " ") + " \\right]";
  },
  vector: function (tree, tok) {
    return "\\left ( " + this.texVector((tok as { value: math.NumbasNumber[] }).value, number_options(tok)) + " \\right )";
  },
  matrix: function (tree, tok) {
    let m = this.texMatrix((tok as { value: math.Matrix }).value, false, number_options(tok));
    if (!this.settings.barematrices) {
      m = "\\left ( " + m + " \\right )";
    }
    return m;
  },
  name: function (tree, tok) {
    const c = this.scope.getConstant((tok as TName).name);
    if (c) {
      return c.tex as string;
    }
    return this.texName(tok as TName);
  },
  op: function (tree, tok, texArgs) {
    return this.texOp(tree, tok as TOp, texArgs as string[]);
  },
  function: function (tree, tok, texArgs) {
    return this.texFunction(tree, tok as TFunc, texArgs as string[]);
  },
  set: function (tree, tok) {
    const texArgs: string[] = [];
    const value = (tok as { value: Token[] }).value;
    for (let i = 0; i < value.length; i++) {
      texArgs.push(this.render({ tok: value[i] as Token }));
    }
    return "\\left\\{ " + texArgs.join(LIST_SEPARATOR + " ") + " \\right\\}";
  },
  expression: function (tree, tok) {
    return this.render((tok as { tree: Tree }).tree);
  },
  lambda: function (tree, tok) {
    const t = tok as { names: Tree[]; expr: Tree };
    let names = t.names.map((name) => this.render(name)).join(", ");
    if (names.length !== 1) {
      names = "\\left(" + names + "\\right)";
    }
    const expr = this.render(t.expr);
    return "\\left(" + names + " \\to " + expr + "\\right)";
  },
};

// jme-display.js:843-858
/** Appiattisce l'applicazione annidata di un solo operatore, es. `((1*2)*3)*4`,
 * così che l'albero abbia un operatore con due o più argomenti. */
export function flatten(tree: Tree, op: string): Tree[] {
  if (!isOp(tree.tok, op)) {
    return [tree];
  }
  let args: Tree[] = [];
  const targs = tree.args as Tree[];
  for (let i = 0; i < targs.length; i++) {
    args = args.concat(flatten(targs[i] as Tree, op));
  }
  return args;
}
