#!/usr/bin/env bash
# Scarica dal database pubblico dell'editor Numbas (numbas.mathcentre.ac.uk) le
# domande elencate in `packages/engine/test/fixtures/public/sources.txt` e le
# scrive come JSON singoli in `packages/engine/test/fixtures/public/`, dove
# `test/differential/corpus.ts` le raccoglie da sé.
#
# L'esportazione NON richiede autenticazione, ma nemmeno un endpoint JSON
# diretto: la pagina della domanda contiene un link
# `/question/<id>/<slug>.exam?token=<uuid>` con un token monouso, e il file
# `.exam` è una riga di commento (`// Numbas version: ...`) seguita da un
# oggetto JSON di esame, in cui la domanda sta in
# `question_groups[0].questions[0]`. Vedi il README della cartella.
#
# Scarica SOLO le domande con licenza CC BY (attribuzione semplice): le altre
# licenze del database pubblico (NC, ND, SA, "None specified") non sono
# compatibili con questo repository. Le domande scaricate NON vanno
# committate: sono opera di terzi e la cartella è in `.gitignore`.
#
# Uso: bash scripts/engine/fetch-public-questions.sh
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
dir="$root/packages/engine/test/fixtures/public"
sources="$dir/sources.txt"
host="https://numbas.mathcentre.ac.uk"

if [ ! -f "$sources" ]; then
  echo "manca $sources" >&2
  exit 1
fi

mkdir -p "$dir"
scaricate=0
saltate=0

while IFS= read -r line; do
  # righe vuote e commenti
  case "$line" in "" | \#*) continue ;; esac
  url="$line"
  case "$url" in "$host"*) path="${url#"$host"}" ;; /*) path="$url" ;; *) echo "URL non riconosciuto: $url" >&2; continue ;; esac

  html="$(curl -sS --max-time 60 "$host$path")"
  token_href="$(printf '%s' "$html" | grep -oE 'href="/question/[0-9]+/[^"]*\.exam\?token=[^"]*"' | head -1 | sed 's/^href="//; s/"$//')"
  if [ -z "$token_href" ]; then
    echo "  nessun link di esportazione in $path (la domanda è privata?)" >&2
    saltate=$((saltate + 1))
    continue
  fi

  id="$(printf '%s' "$path" | sed -E 's|^/question/([0-9]+)/.*|\1|')"
  slug="$(printf '%s' "$path" | sed -E 's|^/question/[0-9]+/([^/]+)/?.*|\1|')"
  exam="$(curl -sS --max-time 60 "$host$token_href")"

  if printf '%s' "$exam" | python3 "$root/scripts/engine/extract-public-question.py" "$dir/$id-$slug.json" "$host$path"; then
    echo "  ok $id-$slug"
    scaricate=$((scaricate + 1))
  else
    saltate=$((saltate + 1))
  fi
done < "$sources"

echo "$scaricate domande scaricate, $saltate saltate → packages/engine/test/fixtures/public/"
