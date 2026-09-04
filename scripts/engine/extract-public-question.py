"""Estrae la domanda da un file `.exam` dell'editor Numbas letto da stdin.

Scrive il JSON della domanda nel percorso dato come primo argomento, ma solo
se la licenza dichiarata è CC BY (attribuzione semplice). Il secondo argomento
è l'URL di provenienza, conservato in `_savint_source` accanto alla licenza e
agli autori: senza attribuzione la domanda non è ridistribuibile.

Lo usa `scripts/engine/fetch-public-questions.sh`.
"""

import json
import sys

CC_BY = "Creative Commons Attribution 4.0 International"


def main() -> int:
    dest, source_url = sys.argv[1], sys.argv[2]
    raw = sys.stdin.read()
    start = raw.find("{")
    if start < 0:
        print("  file .exam senza corpo JSON", file=sys.stderr)
        return 1
    exam = json.loads(raw[start:])
    groups = exam.get("question_groups") or []
    questions = (groups[0].get("questions") if groups else None) or []
    if not questions:
        print("  nessuna domanda nel file .exam", file=sys.stderr)
        return 1
    question = questions[0]
    licence = (question.get("metadata") or {}).get("licence", "")
    if licence != CC_BY:
        print(f"  licenza non CC BY ({licence or 'non dichiarata'}): saltata", file=sys.stderr)
        return 1
    question["_savint_source"] = {
        "url": source_url,
        "licence": licence,
        "contributors": question.get("contributors", []),
    }
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(question, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
