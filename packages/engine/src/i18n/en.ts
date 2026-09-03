/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// English messages for the error keys thrown by `jme/`. Same key set as
// `i18n/it.ts` — the two dictionaries must stay in sync (there is a test for
// it in test/unit/i18n.test.ts). Texts are rewritten for SAVINT, taking the
// upstream `locales/en-GB.json` entries only as a starting point; placeholders
// use the `{name}` form read by `t()`.

export const en: Record<string, string> = {
  "jme.calculus.unknown derivative": "I don't know how to differentiate {tree}",
  "jme.compile list.mismatched bracket": "Mismatched brackets in the list of expressions",
  "jme.compile list.missing right bracket": "A closing bracket is missing in the list of expressions",
  "jme.display.collectRuleset.no sets": "Collecting a ruleset needs the list of the rulesets in scope",
  "jme.display.collectRuleset.set not defined": "The ruleset {name} is not defined",
  "jme.display.simplifyTree.stuck in a loop": "Simplifying {expr} got stuck in a loop: the rules undo each other",
  "jme.evaluate.no scope given": "Evaluating an expression needs a scope",
  "jme.makeFast.no fast definition of function": "The function {name} has no definition that can be made fast",
  "jme.matchTree.group name not a name": "The name of a captured group must be a name or a key-value pair",
  "jme.matchTree.match macro first argument not a dictionary":
    "The first argument of `@ must be a dictionary of sub-patterns",
  "jme.matrix.reports bad size": "The matrix reports a size which does not match its contents",
  "jme.matrix.value not the right type": "Value of the wrong type used to build a matrix",
  "jme.parse signature.invalid signature string": "Invalid function signature: {str}",
  "jme.shunt.expected argument before comma": "An argument is missing before the comma",
  "jme.shunt.keypair in wrong place": "Key-value pair out of place: a dictionary or a pattern is needed",
  "jme.shunt.list mixed argument types": "List elements ({mode}) and dictionary elements ({argmode}) can't be mixed",
  "jme.shunt.missing operator": "An operator is missing: the expression can't be evaluated",
  "jme.shunt.no left bracket": "There is no matching opening bracket",
  "jme.shunt.no left bracket in function": "There is no matching opening bracket in the function application",
  "jme.shunt.no right bracket": "There is no matching closing bracket",
  "jme.shunt.no right square bracket": "There is no matching closing square bracket to end the list",
  "jme.shunt.not enough arguments": "Not enough arguments for the operation {op}",
  "jme.shunt.pipe right hand takes no arguments":
    "The right-hand side of the pipe operator must be a function application",
  "jme.substituteTree.undefined variable": "Undefined variable: {name}",
  "jme.subvars.error compiling": "{message} in the expression {expression}",
  "jme.subvars.null substitution": "Empty substitution in {str}",
  "jme.subvars.display not available": "Substituting into {op} needs the display module, which is not loaded yet",
  "jme.texsubvars.missing parameter": "Missing parameter in {op}: {parameter}",
  "jme.texsubvars.no right brace": "No matching closing brace in {op}",
  "jme.texsubvars.no right bracket": "No matching closing square bracket in the arguments of {op}",
  "jme.thtml.not html": "A non-HTML value was passed to the html type constructor",
  "jme.tokenise.invalid near": "Invalid expression: {expression}, at position {position} near {nearby}",
  "jme.tokenise.keypair key not a string": "A dictionary key must be a string, not {type}",
  "jme.tokenise.number.object not complex": "A non-complex object was passed to a number constructor",
  "jme.tokenise.parser not ready": "The standard parser has not been initialised yet",
  "jme.type.no cast method": "There is no automatic conversion from {from} to {to}",
  "jme.type.type already registered": "The data type {type} is already registered",
  "jme.typecheck.function maybe implicit multiplication":
    "The function {name} is not defined: did you mean {first}*{possibleOp}(...)?",
  "jme.typecheck.function not defined":
    "The function {op} is not defined: is {op} a variable, and did you mean {suggestion}*(...)?",
  "jme.typecheck.no right type definition": "No definition of {op} matches these argument types",
  "jme.typecheck.no right type unbound name": "The variable {name} is not defined",
  "jme.typecheck.op not defined": "The operation {op} is not defined",
  "jme.typecheck.wrong arguments for anonymous function": "Wrong number of arguments for this anonymous function",
  "jme.typecheck.wrong names for anonymous function":
    "Invalid argument names for an anonymous function: {names_type}",
  "jme.vector.value not an array of numbers": "A vector must be built from an array of numbers",
  "util.equality not defined for type": "Equality is not defined for the type {type}",
};
