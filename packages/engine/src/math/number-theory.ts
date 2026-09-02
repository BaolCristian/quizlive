/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// math.js:1905-2352 — teoria dei numeri e combinatoria su interi/bigint.

import type { NumbasNumber } from "./types";
import { isComplex } from "./types";
import { ensure_bigint, abs, add, mul } from "./complex";
import { max } from "./compare";
import { isInt } from "./predicates";

// math.js:1905-1918
/** Prodotto degli interi in `[a,b]` (circa `a!/b!`). Ritorna `bigint` solo se
 * *entrambi* gli argomenti erano già `bigint`. */
export function productRange(a: NumbasNumber, b: NumbasNumber): NumbasNumber {
  const use_bigint = typeof a == "bigint" && typeof b == "bigint";
  const ab = ensure_bigint(a as bigint | number);
  const bb = ensure_bigint(b as bigint | number);
  if (ab > bb) {
    return 1n;
  }
  let product = ab;
  let i = ab;
  while (i++ < bb) {
    product *= i;
  }
  return use_bigint ? product : Number(product);
}

// math.js:1926-1943
/** `nCk` — numero di modi di scegliere `k` elementi non ordinati da `n`. */
export function combinations(n: NumbasNumber, k: NumbasNumber): NumbasNumber {
  if (isComplex(n) || isComplex(k)) {
    throw new Error("math.combinations.complex");
  }
  const nb = ensure_bigint(n as bigint | number);
  let kb = ensure_bigint(k as bigint | number);
  if (nb < 0n) {
    throw new Error("math.combinations.n less than zero");
  }
  if (kb < 0n) {
    throw new Error("math.combinations.k less than zero");
  }
  if (nb < kb) {
    throw new Error("math.combinations.n less than k");
  }
  kb = max(kb, nb - kb) as bigint;
  return (productRange(kb + 1n, nb) as bigint) / (productRange(1n, nb - kb) as bigint);
}

// math.js:1951-1967
/** `nPk` — numero di modi di scegliere `k` elementi ordinati da `n`. */
export function permutations(n: NumbasNumber, k: NumbasNumber): NumbasNumber {
  if (isComplex(n) || isComplex(k)) {
    throw new Error("math.permutations.complex");
  }
  const nb = ensure_bigint(n as bigint | number);
  const kb = ensure_bigint(k as bigint | number);
  if (nb < 0n) {
    throw new Error("math.permutations.n less than zero");
  }
  if (kb < 0n) {
    throw new Error("math.permutations.k less than zero");
  }
  if (nb < kb) {
    throw new Error("math.permutations.n less than k");
  }
  return productRange(nb - kb + 1n, nb);
}

// math.js:1974-1979
/** `a` divide `b`? Falso se uno dei due non è un intero, o è complesso. */
export function divides(a: NumbasNumber, b: NumbasNumber): boolean {
  if (isComplex(a) || isComplex(b) || !isInt(a) || !isInt(b)) {
    return false;
  }
  return a != 0 && (b as number) % (a as number) == 0;
}

// math.js:1987-2011
/** Massimo comun divisore (MCD) di `a` e `b`; `1n` se non entrambi interi finiti. */
export function gcd(a: NumbasNumber, b: NumbasNumber): NumbasNumber {
  if (isComplex(a) || isComplex(b)) {
    throw new Error("math.gcf.complex");
  }
  if (
    (typeof a != "bigint" && (Math.floor(a as number) != a || Math.abs(a as number) == Infinity)) ||
    (typeof b != "bigint" && (Math.floor(b as number) != b || Math.abs(b as number) == Infinity))
  ) {
    return 1n;
  }
  const use_bigint = typeof a == "bigint" && typeof b == "bigint";
  let ab = abs(ensure_bigint(a as bigint | number)) as bigint;
  let bb = abs(ensure_bigint(b as bigint | number)) as bigint;
  if (ab < bb) {
    const c = ab;
    ab = bb;
    bb = c;
  }
  if (bb == 0n) {
    // upstream: ritorna sempre il bigint `a` qui, ignorando `use_bigint`
    // (asimmetria upstream: gcd(5,0) ritorna 5n anche se gli argomenti erano
    // number) — non "raddrizzato", per fedeltà.
    return ab;
  }
  while (ab % bb != 0n) {
    const c = bb;
    bb = ab % bb;
    ab = c;
  }
  return use_bigint ? bb : Number(bb);
}

// math.js:2354 — alias tardivo `math.gcf = math.gcd` nell'upstream; qui è un
// alias diretto di export, senza indirezione dinamica (§6.7 dell'inventario).
export const gcf = gcd;

// math.js:2020-2025
/** `a` e `b` sono coprimi? Equivalente a `gcd(a,b)==1`. `true` se uno dei due
 * non è intero (comportamento permissivo, diverso da `divides`). */
export function coprime(a: NumbasNumber, b: NumbasNumber): boolean {
  if (isComplex(a) || isComplex(b) || !isInt(a) || !isInt(b)) {
    return true;
  }
  return gcd(a, b) == 1n;
}

// math.js:2033-2063
/** Minimo comune multiplo (mcm), variadico (0, 1, 2 o N argomenti). Chiama
 * `gcd` direttamente (§6.7: niente alias tardivo `gcf` interno). */
export function lcm(...args: NumbasNumber[]): NumbasNumber {
  if (args.length == 0) {
    return 1n;
  } else if (args.length == 1) {
    return args[0]!;
  }
  const a = args[0]!;
  const b = args[1]!;
  if (isComplex(a) || isComplex(b)) {
    throw new Error("math.lcm.complex");
  }
  let use_bigint = typeof a == "bigint";
  if (args.length > 2) {
    let ab = abs(ensure_bigint(a as bigint | number)) as bigint;
    for (let i = 1; i < args.length; i++) {
      const argi = args[i]!;
      if (isComplex(argi)) {
        throw new Error("math.lcm.complex");
      }
      const bb = abs(ensure_bigint(argi as bigint | number)) as bigint;
      use_bigint = use_bigint && typeof argi == "bigint";
      ab = (ab * bb) / (gcd(ab, bb) as bigint);
    }
    return use_bigint ? ab : Number(ab);
  }

  use_bigint = use_bigint && typeof b == "bigint";

  const ab = abs(ensure_bigint(a as bigint | number)) as bigint;
  const bb = abs(ensure_bigint(b as bigint | number)) as bigint;
  const c = gcd(ab, bb) as bigint;
  const l = (ab * bb) / c;
  return use_bigint ? l : Number(l);
}

// math.js:2214 — "the first 1000 primes". Corregge il baco upstream:
// `7207` e `7211` erano concatenati in un unico elemento `72077211` per una
// virgola mancante nel sorgente (999 elementi invece di 1000, non ordinato
// in quel punto) — vedi DIVERGENCES.md e §6.1/decisione 1 dell'inventario.
export const primes: number[] = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109,
  113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239,
  241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307, 311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379,
  383, 389, 397, 401, 409, 419, 421, 431, 433, 439, 443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503, 509, 521,
  523, 541, 547, 557, 563, 569, 571, 577, 587, 593, 599, 601, 607, 613, 617, 619, 631, 641, 643, 647, 653, 659, 661,
  673, 677, 683, 691, 701, 709, 719, 727, 733, 739, 743, 751, 757, 761, 769, 773, 787, 797, 809, 811, 821, 823, 827,
  829, 839, 853, 857, 859, 863, 877, 881, 883, 887, 907, 911, 919, 929, 937, 941, 947, 953, 967, 971, 977, 983, 991,
  997, 1009, 1013, 1019, 1021, 1031, 1033, 1039, 1049, 1051, 1061, 1063, 1069, 1087, 1091, 1093, 1097, 1103, 1109,
  1117, 1123, 1129, 1151, 1153, 1163, 1171, 1181, 1187, 1193, 1201, 1213, 1217, 1223, 1229, 1231, 1237, 1249, 1259,
  1277, 1279, 1283, 1289, 1291, 1297, 1301, 1303, 1307, 1319, 1321, 1327, 1361, 1367, 1373, 1381, 1399, 1409, 1423,
  1427, 1429, 1433, 1439, 1447, 1451, 1453, 1459, 1471, 1481, 1483, 1487, 1489, 1493, 1499, 1511, 1523, 1531, 1543,
  1549, 1553, 1559, 1567, 1571, 1579, 1583, 1597, 1601, 1607, 1609, 1613, 1619, 1621, 1627, 1637, 1657, 1663, 1667,
  1669, 1693, 1697, 1699, 1709, 1721, 1723, 1733, 1741, 1747, 1753, 1759, 1777, 1783, 1787, 1789, 1801, 1811, 1823,
  1831, 1847, 1861, 1867, 1871, 1873, 1877, 1879, 1889, 1901, 1907, 1913, 1931, 1933, 1949, 1951, 1973, 1979, 1987,
  1993, 1997, 1999, 2003, 2011, 2017, 2027, 2029, 2039, 2053, 2063, 2069, 2081, 2083, 2087, 2089, 2099, 2111, 2113,
  2129, 2131, 2137, 2141, 2143, 2153, 2161, 2179, 2203, 2207, 2213, 2221, 2237, 2239, 2243, 2251, 2267, 2269, 2273,
  2281, 2287, 2293, 2297, 2309, 2311, 2333, 2339, 2341, 2347, 2351, 2357, 2371, 2377, 2381, 2383, 2389, 2393, 2399,
  2411, 2417, 2423, 2437, 2441, 2447, 2459, 2467, 2473, 2477, 2503, 2521, 2531, 2539, 2543, 2549, 2551, 2557, 2579,
  2591, 2593, 2609, 2617, 2621, 2633, 2647, 2657, 2659, 2663, 2671, 2677, 2683, 2687, 2689, 2693, 2699, 2707, 2711,
  2713, 2719, 2729, 2731, 2741, 2749, 2753, 2767, 2777, 2789, 2791, 2797, 2801, 2803, 2819, 2833, 2837, 2843, 2851,
  2857, 2861, 2879, 2887, 2897, 2903, 2909, 2917, 2927, 2939, 2953, 2957, 2963, 2969, 2971, 2999, 3001, 3011, 3019,
  3023, 3037, 3041, 3049, 3061, 3067, 3079, 3083, 3089, 3109, 3119, 3121, 3137, 3163, 3167, 3169, 3181, 3187, 3191,
  3203, 3209, 3217, 3221, 3229, 3251, 3253, 3257, 3259, 3271, 3299, 3301, 3307, 3313, 3319, 3323, 3329, 3331, 3343,
  3347, 3359, 3361, 3371, 3373, 3389, 3391, 3407, 3413, 3433, 3449, 3457, 3461, 3463, 3467, 3469, 3491, 3499, 3511,
  3517, 3527, 3529, 3533, 3539, 3541, 3547, 3557, 3559, 3571, 3581, 3583, 3593, 3607, 3613, 3617, 3623, 3631, 3637,
  3643, 3659, 3671, 3673, 3677, 3691, 3697, 3701, 3709, 3719, 3727, 3733, 3739, 3761, 3767, 3769, 3779, 3793, 3797,
  3803, 3821, 3823, 3833, 3847, 3851, 3853, 3863, 3877, 3881, 3889, 3907, 3911, 3917, 3919, 3923, 3929, 3931, 3943,
  3947, 3967, 3989, 4001, 4003, 4007, 4013, 4019, 4021, 4027, 4049, 4051, 4057, 4073, 4079, 4091, 4093, 4099, 4111,
  4127, 4129, 4133, 4139, 4153, 4157, 4159, 4177, 4201, 4211, 4217, 4219, 4229, 4231, 4241, 4243, 4253, 4259, 4261,
  4271, 4273, 4283, 4289, 4297, 4327, 4337, 4339, 4349, 4357, 4363, 4373, 4391, 4397, 4409, 4421, 4423, 4441, 4447,
  4451, 4457, 4463, 4481, 4483, 4493, 4507, 4513, 4517, 4519, 4523, 4547, 4549, 4561, 4567, 4583, 4591, 4597, 4603,
  4621, 4637, 4639, 4643, 4649, 4651, 4657, 4663, 4673, 4679, 4691, 4703, 4721, 4723, 4729, 4733, 4751, 4759, 4783,
  4787, 4789, 4793, 4799, 4801, 4813, 4817, 4831, 4861, 4871, 4877, 4889, 4903, 4909, 4919, 4931, 4933, 4937, 4943,
  4951, 4957, 4967, 4969, 4973, 4987, 4993, 4999, 5003, 5009, 5011, 5021, 5023, 5039, 5051, 5059, 5077, 5081, 5087,
  5099, 5101, 5107, 5113, 5119, 5147, 5153, 5167, 5171, 5179, 5189, 5197, 5209, 5227, 5231, 5233, 5237, 5261, 5273,
  5279, 5281, 5297, 5303, 5309, 5323, 5333, 5347, 5351, 5381, 5387, 5393, 5399, 5407, 5413, 5417, 5419, 5431, 5437,
  5441, 5443, 5449, 5471, 5477, 5479, 5483, 5501, 5503, 5507, 5519, 5521, 5527, 5531, 5557, 5563, 5569, 5573, 5581,
  5591, 5623, 5639, 5641, 5647, 5651, 5653, 5657, 5659, 5669, 5683, 5689, 5693, 5701, 5711, 5717, 5737, 5741, 5743,
  5749, 5779, 5783, 5791, 5801, 5807, 5813, 5821, 5827, 5839, 5843, 5849, 5851, 5857, 5861, 5867, 5869, 5879, 5881,
  5897, 5903, 5923, 5927, 5939, 5953, 5981, 5987, 6007, 6011, 6029, 6037, 6043, 6047, 6053, 6067, 6073, 6079, 6089,
  6091, 6101, 6113, 6121, 6131, 6133, 6143, 6151, 6163, 6173, 6197, 6199, 6203, 6211, 6217, 6221, 6229, 6247, 6257,
  6263, 6269, 6271, 6277, 6287, 6299, 6301, 6311, 6317, 6323, 6329, 6337, 6343, 6353, 6359, 6361, 6367, 6373, 6379,
  6389, 6397, 6421, 6427, 6449, 6451, 6469, 6473, 6481, 6491, 6521, 6529, 6547, 6551, 6553, 6563, 6569, 6571, 6577,
  6581, 6599, 6607, 6619, 6637, 6653, 6659, 6661, 6673, 6679, 6689, 6691, 6701, 6703, 6709, 6719, 6733, 6737, 6761,
  6763, 6779, 6781, 6791, 6793, 6803, 6823, 6827, 6829, 6833, 6841, 6857, 6863, 6869, 6871, 6883, 6899, 6907, 6911,
  6917, 6947, 6949, 6959, 6961, 6967, 6971, 6977, 6983, 6991, 6997, 7001, 7013, 7019, 7027, 7039, 7043, 7057, 7069,
  7079, 7103, 7109, 7121, 7127, 7129, 7151, 7159, 7177, 7187, 7193, 7207, 7211, 7213, 7219, 7229, 7237, 7243, 7247,
  7253, 7283, 7297, 7307, 7309, 7321, 7331, 7333, 7349, 7351, 7369, 7393, 7411, 7417, 7433, 7451, 7457, 7459, 7477,
  7481, 7487, 7489, 7499, 7507, 7517, 7523, 7529, 7537, 7541, 7547, 7549, 7559, 7561, 7573, 7577, 7583, 7589, 7591,
  7603, 7607, 7621, 7639, 7643, 7649, 7669, 7673, 7681, 7687, 7691, 7699, 7703, 7717, 7723, 7727, 7741, 7753, 7757,
  7759, 7789, 7793, 7817, 7823, 7829, 7841, 7853, 7867, 7873, 7877, 7879, 7883, 7901, 7907, 7919
];

// math.js:2215 — come sopra, in bigint. Stessa correzione.
export const primes_bigints: bigint[] = [
  2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n,
  97n, 101n, 103n, 107n, 109n, 113n, 127n, 131n, 137n, 139n, 149n, 151n, 157n, 163n, 167n, 173n, 179n, 181n, 191n,
  193n, 197n, 199n, 211n, 223n, 227n, 229n, 233n, 239n, 241n, 251n, 257n, 263n, 269n, 271n, 277n, 281n, 283n, 293n,
  307n, 311n, 313n, 317n, 331n, 337n, 347n, 349n, 353n, 359n, 367n, 373n, 379n, 383n, 389n, 397n, 401n, 409n, 419n,
  421n, 431n, 433n, 439n, 443n, 449n, 457n, 461n, 463n, 467n, 479n, 487n, 491n, 499n, 503n, 509n, 521n, 523n, 541n,
  547n, 557n, 563n, 569n, 571n, 577n, 587n, 593n, 599n, 601n, 607n, 613n, 617n, 619n, 631n, 641n, 643n, 647n, 653n,
  659n, 661n, 673n, 677n, 683n, 691n, 701n, 709n, 719n, 727n, 733n, 739n, 743n, 751n, 757n, 761n, 769n, 773n, 787n,
  797n, 809n, 811n, 821n, 823n, 827n, 829n, 839n, 853n, 857n, 859n, 863n, 877n, 881n, 883n, 887n, 907n, 911n, 919n,
  929n, 937n, 941n, 947n, 953n, 967n, 971n, 977n, 983n, 991n, 997n, 1009n, 1013n, 1019n, 1021n, 1031n, 1033n, 1039n,
  1049n, 1051n, 1061n, 1063n, 1069n, 1087n, 1091n, 1093n, 1097n, 1103n, 1109n, 1117n, 1123n, 1129n, 1151n, 1153n,
  1163n, 1171n, 1181n, 1187n, 1193n, 1201n, 1213n, 1217n, 1223n, 1229n, 1231n, 1237n, 1249n, 1259n, 1277n, 1279n,
  1283n, 1289n, 1291n, 1297n, 1301n, 1303n, 1307n, 1319n, 1321n, 1327n, 1361n, 1367n, 1373n, 1381n, 1399n, 1409n,
  1423n, 1427n, 1429n, 1433n, 1439n, 1447n, 1451n, 1453n, 1459n, 1471n, 1481n, 1483n, 1487n, 1489n, 1493n, 1499n,
  1511n, 1523n, 1531n, 1543n, 1549n, 1553n, 1559n, 1567n, 1571n, 1579n, 1583n, 1597n, 1601n, 1607n, 1609n, 1613n,
  1619n, 1621n, 1627n, 1637n, 1657n, 1663n, 1667n, 1669n, 1693n, 1697n, 1699n, 1709n, 1721n, 1723n, 1733n, 1741n,
  1747n, 1753n, 1759n, 1777n, 1783n, 1787n, 1789n, 1801n, 1811n, 1823n, 1831n, 1847n, 1861n, 1867n, 1871n, 1873n,
  1877n, 1879n, 1889n, 1901n, 1907n, 1913n, 1931n, 1933n, 1949n, 1951n, 1973n, 1979n, 1987n, 1993n, 1997n, 1999n,
  2003n, 2011n, 2017n, 2027n, 2029n, 2039n, 2053n, 2063n, 2069n, 2081n, 2083n, 2087n, 2089n, 2099n, 2111n, 2113n,
  2129n, 2131n, 2137n, 2141n, 2143n, 2153n, 2161n, 2179n, 2203n, 2207n, 2213n, 2221n, 2237n, 2239n, 2243n, 2251n,
  2267n, 2269n, 2273n, 2281n, 2287n, 2293n, 2297n, 2309n, 2311n, 2333n, 2339n, 2341n, 2347n, 2351n, 2357n, 2371n,
  2377n, 2381n, 2383n, 2389n, 2393n, 2399n, 2411n, 2417n, 2423n, 2437n, 2441n, 2447n, 2459n, 2467n, 2473n, 2477n,
  2503n, 2521n, 2531n, 2539n, 2543n, 2549n, 2551n, 2557n, 2579n, 2591n, 2593n, 2609n, 2617n, 2621n, 2633n, 2647n,
  2657n, 2659n, 2663n, 2671n, 2677n, 2683n, 2687n, 2689n, 2693n, 2699n, 2707n, 2711n, 2713n, 2719n, 2729n, 2731n,
  2741n, 2749n, 2753n, 2767n, 2777n, 2789n, 2791n, 2797n, 2801n, 2803n, 2819n, 2833n, 2837n, 2843n, 2851n, 2857n,
  2861n, 2879n, 2887n, 2897n, 2903n, 2909n, 2917n, 2927n, 2939n, 2953n, 2957n, 2963n, 2969n, 2971n, 2999n, 3001n,
  3011n, 3019n, 3023n, 3037n, 3041n, 3049n, 3061n, 3067n, 3079n, 3083n, 3089n, 3109n, 3119n, 3121n, 3137n, 3163n,
  3167n, 3169n, 3181n, 3187n, 3191n, 3203n, 3209n, 3217n, 3221n, 3229n, 3251n, 3253n, 3257n, 3259n, 3271n, 3299n,
  3301n, 3307n, 3313n, 3319n, 3323n, 3329n, 3331n, 3343n, 3347n, 3359n, 3361n, 3371n, 3373n, 3389n, 3391n, 3407n,
  3413n, 3433n, 3449n, 3457n, 3461n, 3463n, 3467n, 3469n, 3491n, 3499n, 3511n, 3517n, 3527n, 3529n, 3533n, 3539n,
  3541n, 3547n, 3557n, 3559n, 3571n, 3581n, 3583n, 3593n, 3607n, 3613n, 3617n, 3623n, 3631n, 3637n, 3643n, 3659n,
  3671n, 3673n, 3677n, 3691n, 3697n, 3701n, 3709n, 3719n, 3727n, 3733n, 3739n, 3761n, 3767n, 3769n, 3779n, 3793n,
  3797n, 3803n, 3821n, 3823n, 3833n, 3847n, 3851n, 3853n, 3863n, 3877n, 3881n, 3889n, 3907n, 3911n, 3917n, 3919n,
  3923n, 3929n, 3931n, 3943n, 3947n, 3967n, 3989n, 4001n, 4003n, 4007n, 4013n, 4019n, 4021n, 4027n, 4049n, 4051n,
  4057n, 4073n, 4079n, 4091n, 4093n, 4099n, 4111n, 4127n, 4129n, 4133n, 4139n, 4153n, 4157n, 4159n, 4177n, 4201n,
  4211n, 4217n, 4219n, 4229n, 4231n, 4241n, 4243n, 4253n, 4259n, 4261n, 4271n, 4273n, 4283n, 4289n, 4297n, 4327n,
  4337n, 4339n, 4349n, 4357n, 4363n, 4373n, 4391n, 4397n, 4409n, 4421n, 4423n, 4441n, 4447n, 4451n, 4457n, 4463n,
  4481n, 4483n, 4493n, 4507n, 4513n, 4517n, 4519n, 4523n, 4547n, 4549n, 4561n, 4567n, 4583n, 4591n, 4597n, 4603n,
  4621n, 4637n, 4639n, 4643n, 4649n, 4651n, 4657n, 4663n, 4673n, 4679n, 4691n, 4703n, 4721n, 4723n, 4729n, 4733n,
  4751n, 4759n, 4783n, 4787n, 4789n, 4793n, 4799n, 4801n, 4813n, 4817n, 4831n, 4861n, 4871n, 4877n, 4889n, 4903n,
  4909n, 4919n, 4931n, 4933n, 4937n, 4943n, 4951n, 4957n, 4967n, 4969n, 4973n, 4987n, 4993n, 4999n, 5003n, 5009n,
  5011n, 5021n, 5023n, 5039n, 5051n, 5059n, 5077n, 5081n, 5087n, 5099n, 5101n, 5107n, 5113n, 5119n, 5147n, 5153n,
  5167n, 5171n, 5179n, 5189n, 5197n, 5209n, 5227n, 5231n, 5233n, 5237n, 5261n, 5273n, 5279n, 5281n, 5297n, 5303n,
  5309n, 5323n, 5333n, 5347n, 5351n, 5381n, 5387n, 5393n, 5399n, 5407n, 5413n, 5417n, 5419n, 5431n, 5437n, 5441n,
  5443n, 5449n, 5471n, 5477n, 5479n, 5483n, 5501n, 5503n, 5507n, 5519n, 5521n, 5527n, 5531n, 5557n, 5563n, 5569n,
  5573n, 5581n, 5591n, 5623n, 5639n, 5641n, 5647n, 5651n, 5653n, 5657n, 5659n, 5669n, 5683n, 5689n, 5693n, 5701n,
  5711n, 5717n, 5737n, 5741n, 5743n, 5749n, 5779n, 5783n, 5791n, 5801n, 5807n, 5813n, 5821n, 5827n, 5839n, 5843n,
  5849n, 5851n, 5857n, 5861n, 5867n, 5869n, 5879n, 5881n, 5897n, 5903n, 5923n, 5927n, 5939n, 5953n, 5981n, 5987n,
  6007n, 6011n, 6029n, 6037n, 6043n, 6047n, 6053n, 6067n, 6073n, 6079n, 6089n, 6091n, 6101n, 6113n, 6121n, 6131n,
  6133n, 6143n, 6151n, 6163n, 6173n, 6197n, 6199n, 6203n, 6211n, 6217n, 6221n, 6229n, 6247n, 6257n, 6263n, 6269n,
  6271n, 6277n, 6287n, 6299n, 6301n, 6311n, 6317n, 6323n, 6329n, 6337n, 6343n, 6353n, 6359n, 6361n, 6367n, 6373n,
  6379n, 6389n, 6397n, 6421n, 6427n, 6449n, 6451n, 6469n, 6473n, 6481n, 6491n, 6521n, 6529n, 6547n, 6551n, 6553n,
  6563n, 6569n, 6571n, 6577n, 6581n, 6599n, 6607n, 6619n, 6637n, 6653n, 6659n, 6661n, 6673n, 6679n, 6689n, 6691n,
  6701n, 6703n, 6709n, 6719n, 6733n, 6737n, 6761n, 6763n, 6779n, 6781n, 6791n, 6793n, 6803n, 6823n, 6827n, 6829n,
  6833n, 6841n, 6857n, 6863n, 6869n, 6871n, 6883n, 6899n, 6907n, 6911n, 6917n, 6947n, 6949n, 6959n, 6961n, 6967n,
  6971n, 6977n, 6983n, 6991n, 6997n, 7001n, 7013n, 7019n, 7027n, 7039n, 7043n, 7057n, 7069n, 7079n, 7103n, 7109n,
  7121n, 7127n, 7129n, 7151n, 7159n, 7177n, 7187n, 7193n, 7207n, 7211n, 7213n, 7219n, 7229n, 7237n, 7243n, 7247n,
  7253n, 7283n, 7297n, 7307n, 7309n, 7321n, 7331n, 7333n, 7349n, 7351n, 7369n, 7393n, 7411n, 7417n, 7433n, 7451n,
  7457n, 7459n, 7477n, 7481n, 7487n, 7489n, 7499n, 7507n, 7517n, 7523n, 7529n, 7537n, 7541n, 7547n, 7549n, 7559n,
  7561n, 7573n, 7577n, 7583n, 7589n, 7591n, 7603n, 7607n, 7621n, 7639n, 7643n, 7649n, 7669n, 7673n, 7681n, 7687n,
  7691n, 7699n, 7703n, 7717n, 7723n, 7727n, 7741n, 7753n, 7757n, 7759n, 7789n, 7793n, 7817n, 7823n, 7829n, 7841n,
  7853n, 7867n, 7873n, 7877n, 7879n, 7883n, 7901n, 7907n, 7919n
];

// math.js:2222-2239
/** Tutti i divisori di `n` (inclusi 1 e n). */
export function divisors(n: NumbasNumber): bigint[] {
  const nb = abs(ensure_bigint(n as bigint | number)) as bigint;

  if (nb < 1n) {
    return [];
  }

  let divisor_arr: bigint[] = [1n];
  // upstream (math.js:2222-2231): `n = math.abs(math.ensure_bigint(n))` viene
  // riassegnato PRIMA di chiamare `math.factorise(n)` — bisogna fattorizzare
  // lo stesso valore normalizzato usato per la guardia sopra (`nb`), non
  // l'argomento originale. `ensure_bigint` arrotonda (Math.round,
  // complex.ts) mentre `factorise` tronca (Math.floor, sotto): per un `n`
  // non intero le due normalizzazioni divergono (fix round 1, issue 1).
  const exponents = factorise(nb) as bigint[] | number[];
  for (let i = 0; i < exponents.length; i++) {
    let divisor_arr_copy: bigint[] = [];
    const exp_i = ensure_bigint(exponents[i] as bigint | number);
    for (let j = 0n; j <= exp_i; j++) {
      divisor_arr_copy = divisor_arr_copy.concat(divisor_arr.map((number_) => number_ * primes_bigints[i]! ** j));
    }
    divisor_arr = divisor_arr_copy;
  }
  return divisor_arr;
}

// math.js:2247-2250
/** Divisori propri di `n` (esclude `n` stesso). */
export function proper_divisors(n: NumbasNumber): bigint[] {
  const divs = divisors(n);
  return divs.slice(0, divs.length - 1);
}

// math.js:2257-2280
/** Fattorizza `n`: se `n=2^(a1)*3^(a2)*5^(a3)*...`, ritorna gli esponenti `[a1,a2,a3,...]`. */
export function factorise(n: NumbasNumber): number[] | bigint[] {
  const use_bigint = typeof n == "bigint";
  const nb = abs(n) as NumbasNumber;
  let nn: bigint;
  if (typeof nb != "bigint") {
    nn = BigInt(Math.floor(nb as number));
  } else {
    nn = nb;
  }
  if (nn <= 0n) {
    return [];
  }
  const factors: bigint[] = [];
  for (let i = 0; i < primes_bigints.length; i++) {
    let acc = 0n;
    const p = primes_bigints[i]!;
    while (nn % p == 0n) {
      acc += 1n;
      nn /= p;
    }
    factors.push(acc);
    if (nn == 1n) {
      break;
    }
  }
  return use_bigint ? factors : factors.map((f) => Number(f));
}

// math.js:2290-2306
/** Il più grande fattore quadrato perfetto di `n`. */
export function largest_square_factor(n: NumbasNumber): NumbasNumber {
  const use_bigint = typeof n == "bigint";
  const nb = abs(n) as NumbasNumber;
  let nn: bigint;
  if (typeof nb != "bigint") {
    nn = BigInt(Math.floor(nb as number));
  } else {
    nn = nb;
  }

  const factors = (factorise(nn) as bigint[]).map((f) => f - (f % 2n));
  let t = 1n;
  factors.forEach((f, i) => {
    t *= primes_bigints[i]! ** f;
  });

  return use_bigint ? t : Number(t);
}

// math.js:2313-2330
/** Somma degli elementi della lista. */
export function sum(list: readonly NumbasNumber[]): NumbasNumber {
  const l = list.length;
  if (l == 0) {
    return 0;
  }
  let total: NumbasNumber = 0n;

  for (let i = 0; i < l; i++) {
    let b = list[i]!;
    if (typeof b != "bigint") {
      total = Number(total);
    } else if (typeof total != "bigint") {
      b = Number(b);
    }
    total = add(total, b);
  }
  return total;
}

// math.js:2336-2352
/** Prodotto degli elementi della lista. */
export function prod(list: readonly NumbasNumber[]): NumbasNumber {
  let product: NumbasNumber = 1n;
  if (list.length == 0) {
    return 1;
  }
  for (let i = 0; i < list.length; i++) {
    let b = list[i]!;
    if (typeof b != "bigint") {
      product = Number(product);
    } else if (typeof product != "bigint") {
      b = Number(b);
    }
    product = mul(product, b);
  }
  return product;
}
