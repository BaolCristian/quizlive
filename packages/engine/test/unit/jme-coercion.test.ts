// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Test nostri (non c'è un modulo QUnit corrispondente) sulla coercizione
// automatica dei tipi: `isType`, `castToType`, `findCompatibleType`,
// `castArgumentsToSignature`, `wrapValue` sui casi limite, e soprattutto
// sull'ORDINE delle chiavi in `casts`, da cui dipende quale overload vince
// quando più di uno è candidato (inventario §7.9, domanda aperta 6).

import { describe, it, expect } from "vitest";
import * as math from "../../src/math";
import { FuncObj } from "../../src/jme/funcobj";
import { Scope } from "../../src/jme/scope";
import {
  registerType,
  types,
  TDecimal,
  TDict,
  TInt,
  TList,
  TNothing,
  TNum,
  TRational,
  TSet,
  TString,
  TVector,
  TRange,
  TBool,
  type Casts,
  type Token,
} from "../../src/jme/tokens";
import { castArgumentsToSignature, castToType, findCompatibleType, isType, isTypeCompatible, wrapValue } from "../../src/jme/evaluate";
import { evaluated, raisesJmeError } from "./jme-helpers";

// --- due tipi di prova che si convertono negli stessi tipi, ma con le chiavi
// di `casts` in ordine opposto -------------------------------------------

/** Un tipo di prova che preferisce `number` a `decimal`. */
class TPrefersNumber {
  readonly type = "test_prefers_number";
  value: number;
  constructor(value: number) {
    this.value = value;
  }
}
registerType(TPrefersNumber, "test_prefers_number", {
  number: (t) => new TNum((t as unknown as TPrefersNumber).value),
  decimal: (t) => new TDecimal(new math.Decimal((t as unknown as TPrefersNumber).value)),
} as Casts);

/** Un tipo di prova identico, ma che preferisce `decimal` a `number`. */
class TPrefersDecimal {
  readonly type = "test_prefers_decimal";
  value: number;
  constructor(value: number) {
    this.value = value;
  }
}
registerType(TPrefersDecimal, "test_prefers_decimal", {
  decimal: (t) => new TDecimal(new math.Decimal((t as unknown as TPrefersDecimal).value)),
  number: (t) => new TNum((t as unknown as TPrefersDecimal).value),
} as Casts);

describe("Coercizione dei tipi", () => {
  it("isType riconosce il tipo e i cast disponibili", () => {
    expect(isType(new TNum(1), "number")).toBe(true);
    expect(isType(new TInt(1), "number"), "integer si converte in number").toBe(true);
    expect(isType(new TInt(1), "string"), "integer non si converte in string").toBe(false);
    expect(isType(undefined, "number"), "un token assente non è di nessun tipo").toBe(false);
    expect(isTypeCompatible("integer", undefined), "senza tipo richiesto va sempre bene").toBe(true);
    expect(isTypeCompatible("integer", "decimal")).toBe(true);
    expect(isTypeCompatible("string", "number")).toBe(false);
  });

  it("castToType converte fra i tipi numerici", () => {
    expect((castToType(new TInt(3), "number") as TNum).value).toBe(3);
    expect((castToType(new TInt(3), "rational") as TRational).value.toFloat()).toBe(3);
    expect(String((castToType(new TInt(3), "decimal") as TDecimal).value)).toBe("3");
    expect((castToType(new TNum(2.5), "decimal") as TDecimal).value.re.toNumber()).toBe(2.5);
    expect((castToType(new TDecimal(new math.Decimal("2.5")), "number") as TNum).value).toBe(2.5);
    expect((castToType(new TRational(new math.Fraction(1, 2)), "number") as TNum).value).toBe(0.5);
    expect(castToType(new TNum(1), "number"), "castare al proprio tipo ritorna lo stesso token").toBeInstanceOf(
      TNum,
    );
  });

  it("castToType converte le collezioni in liste", () => {
    const set = new TSet([new TNum(1), new TNum(2)]);
    expect((castToType(set, "list") as TList).value?.length).toBe(2);
    const vector = new TVector([1, 2, 3]);
    const asList = castToType(vector, "list") as TList;
    expect(asList.value?.length).toBe(3);
    expect((asList.value?.[0] as TNum).value).toBe(1);
    const range = new TRange([1, 4, 1]);
    const rangeList = castToType(range, "list") as TList;
    expect(rangeList.value?.length, "1..4 enumera gli estremi inclusi").toBe(4);
    expect((rangeList.value?.[3] as TNum).value).toBe(4);
  });

  it("castToType senza metodo di conversione lancia jme.type.no cast method", () => {
    raisesJmeError(() => castToType(new TString("a"), "number"), "jme.type.no cast method");
  });

  it("castToType accetta una descrizione di tipo per gli elementi", () => {
    // jme.js:766-800: `items` descrive gli elementi uno per uno, `all_items`
    // tutti insieme.
    const list = new TList([new TInt(1), new TInt(2)]);
    const all = castToType(list, { type: "list", all_items: "number" }) as TList;
    expect((all.value?.[0] as TNum).type).toBe("number");
    expect((all.value?.[1] as TNum).type).toBe("number");

    const some = castToType(list, {
      type: "list",
      items: [{ type: "number" }, { type: "decimal" }],
    }) as TList;
    expect((some.value?.[0] as Token).type).toBe("number");
    expect((some.value?.[1] as Token).type).toBe("decimal");

    // un elemento `missing` diventa un `nothing` senza consumare argomenti
    const withMissing = castToType(new TList([new TInt(1)]), {
      type: "list",
      items: [{ missing: true }, { type: "number" }],
    }) as TList;
    expect((withMissing.value?.[0] as Token).type).toBe("nothing");
    expect((withMissing.value?.[1] as TNum).value).toBe(1);

    const dict = new TDict({ a: new TInt(1), b: new TInt(2) });
    const castDict = castToType(dict, { type: "dict", all_items: "number" }) as TDict;
    expect((castDict.value?.["a"] as Token).type).toBe("number");

    const dict2 = new TDict({ a: new TInt(1), b: new TInt(2) });
    const someDict = castToType(dict2, { type: "dict", items: { a: { type: "decimal" } } }) as TDict;
    expect((someDict.value?.["a"] as Token).type).toBe("decimal");
    expect((someDict.value?.["b"] as Token).type, "le chiavi non nominate restano com'erano").toBe("integer");
  });

  it("il ramo dict di castToType condivide l'oggetto value, quello list no", () => {
    // jme.js:766-777: `ntok = new TDict(ntok.value)` riusa lo STESSO oggetto
    // `value` e la conversione degli elementi lo muta, quindi chi aveva in
    // mano il dizionario di partenza se lo ritrova convertito. Il ramo `list`
    // (jme.js:779-800) costruisce invece un array nuovo. Comportamento
    // asimmetrico ma upstream, fissato qui perché non si perda in un
    // refactoring.
    const dict = new TDict({ a: new TInt(1) });
    const source = dict.value as Record<string, Token>;
    const cast = castToType(dict, { type: "dict", all_items: "number" }) as TDict;
    expect(cast.value, "il TDict risultante condivide l'oggetto value").toBe(source);
    expect((dict.value?.["a"] as Token).type, "e l'originale risulta convertito").toBe("number");

    const list = new TList([new TInt(1)]);
    const listSource = list.value as Token[];
    const castList = castToType(list, { type: "list", all_items: "number" }) as TList;
    expect(castList.value, "la lista risultante ha un array nuovo").not.toBe(listSource);
    expect((list.value?.[0] as Token).type, "e l'originale resta com'era").toBe("integer");
  });

  it("findCompatibleType cerca un solo salto", () => {
    expect(findCompatibleType("set", "list"), "set si converte in list").toBe("list");
    expect(findCompatibleType("list", "set"), "e viceversa il tipo comune è list").toBe("list");
    expect(findCompatibleType("vector", "matrix"), "vector e matrix hanno list in comune").toBe("list");
    expect(findCompatibleType("rational", "number")).toBe("number");
    expect(findCompatibleType("boolean", "number"), "nessun tipo comune").toBeUndefined();
    expect(findCompatibleType("number", "tipo_inesistente"), "un tipo sconosciuto dà undefined").toBeUndefined();
  });

  it("wrapValue mappa null e undefined sulla stringa vuota", () => {
    // jme.js:711-713, commentato `CONTROVERSIAL!` nel sorgente: non esiste un
    // valore nullo in JME, e i builtin si aspettano la stringa vuota.
    const fromNull = wrapValue(null);
    expect(fromNull).toBeInstanceOf(TString);
    expect((fromNull as TString).value).toBe("");
    expect(wrapValue(undefined)).toBeInstanceOf(TString);
    expect((wrapValue(undefined) as TString).value).toBe("");
    expect(wrapValue(null).type, "e NON `nothing`").not.toBe("nothing");
  });

  it("castArgumentsToSignature inserisce nothing per gli argomenti mancanti", () => {
    const args = castArgumentsToSignature([{ type: "number" }, { missing: true }], [new TInt(1)]);
    expect(args.length).toBe(2);
    expect(args[0]?.type).toBe("number");
    expect(args[1]).toBeInstanceOf(TNothing);
  });

  it("una firma opzionale accetta la chiamata senza quell'argomento", () => {
    const fn = new FuncObj("g", ["number", "[number]"], TNum, ((a: number) => a) as (...a: never[]) => unknown);
    expect(fn.typecheck([new TNum(1)]), "un argomento basta").toBe(true);
    expect(fn.typecheck([new TNum(1), new TNum(2)]), "due argomenti vanno bene").toBe(true);
    expect(fn.typecheck([new TString("a")]), "il tipo sbagliato no").toBe(false);
  });

  it("l'ordine delle chiavi in casts decide quale overload vince", () => {
    // §7.9 dell'inventario: `compare_matches` confronta la posizione del tipo
    // di destinazione dentro `Object.keys(arg.casts)`. Gli oggetti letterali
    // conservano l'ordine di inserimento delle chiavi stringa, quindi l'ordine
    // in cui si scrivono i cast è semantico.
    expect(Object.keys(types["test_prefers_number"]?.prototype.casts as Casts)).toEqual(["number", "decimal"]);
    expect(Object.keys(types["test_prefers_decimal"]?.prototype.casts as Casts)).toEqual(["decimal", "number"]);

    const scope = new Scope();
    const numberDef = new FuncObj("f", [TNum], TNum, ((a: number) => a) as (...a: never[]) => unknown);
    const decimalDef = new FuncObj(
      "f",
      [TDecimal],
      TDecimal,
      ((a: math.ComplexDecimal) => a) as (...a: never[]) => unknown,
    );
    scope.addFunction(numberDef);
    scope.addFunction(decimalDef);

    const fnTok = { type: "function", name: "f" } as unknown as Token;
    const prefersNumber = scope.matchFunctionToArguments(fnTok, [new TPrefersNumber(1) as unknown as Token]);
    expect(prefersNumber?.fn, "il tipo che elenca number per primo sceglie l'overload number").toBe(numberDef);
    expect(prefersNumber?.signature[0]?.type).toBe("number");

    const prefersDecimal = scope.matchFunctionToArguments(fnTok, [new TPrefersDecimal(1) as unknown as Token]);
    expect(prefersDecimal?.fn, "il tipo che elenca decimal per primo sceglie l'overload decimal").toBe(decimalDef);
    expect(prefersDecimal?.signature[0]?.type).toBe("decimal");

    // l'ordine in cui le definizioni sono aggiunte allo scope non conta
    const reversed = new Scope();
    reversed.addFunction(decimalDef);
    reversed.addFunction(numberDef);
    expect(
      reversed.matchFunctionToArguments(fnTok, [new TPrefersNumber(1) as unknown as Token])?.fn,
      "conta l'ordine dei cast, non quello delle definizioni",
    ).toBe(numberDef);
  });

  it("il match esatto batte qualunque conversione", () => {
    // jme.js:2974-2999: `exactType` ha la precedenza su `compare_matches`.
    const scope = new Scope();
    const numberDef = new FuncObj("f", [TNum], TNum, ((a: number) => a) as (...a: never[]) => unknown);
    const decimalDef = new FuncObj(
      "f",
      [TDecimal],
      TDecimal,
      ((a: math.ComplexDecimal) => a) as (...a: never[]) => unknown,
    );
    scope.addFunction(decimalDef);
    scope.addFunction(numberDef);
    const fnTok = { type: "function", name: "f" } as unknown as Token;
    expect(scope.matchFunctionToArguments(fnTok, [new TNum(1)])?.fn).toBe(numberDef);
    expect(scope.matchFunctionToArguments(fnTok, [new TDecimal(new math.Decimal(1))])?.fn).toBe(decimalDef);
  });

  it("registerType rifiuta un tipo già registrato", () => {
    raisesJmeError(() => registerType(class {}, "number"), "jme.type.type already registered");
  });

  it("i valori si convertono automaticamente chiamando una funzione", () => {
    const scope = new Scope();
    scope.addFunction(
      new FuncObj("double", [TNum], TNum, ((a: number) => a * 2) as (...a: never[]) => unknown),
    );
    // l'argomento è un intero: viene convertito a number prima della chiamata
    expect((scope.evaluate("double(3)") as TNum).value).toBe(6);
    expect(evaluated(scope, "double(3)").type, "il risultato ha il tipo di outcons").toBe("number");
    // un booleano non è convertibile: nessuna definizione adatta
    raisesJmeError(() => scope.evaluate("double(true)"), "jme.typecheck.no right type definition");
    expect(new TBool(true).casts, "boolean non ha cast registrati").toBeUndefined();
  });
});
