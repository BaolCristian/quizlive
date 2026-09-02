#!/usr/bin/env bash
# Clona il runtime Numbas al commit fissato nella spec 02, in .numbas-upstream/ (git-ignored).
set -euo pipefail
COMMIT="0f0ea3337196cb8e98d4edf04f1afaedc8cf8df5"
DIR="$(cd "$(dirname "$0")/../.." && pwd)/.numbas-upstream"
if [ -d "$DIR/.git" ] && [ "$(git -C "$DIR" rev-parse HEAD)" = "$COMMIT" ]; then
  echo "upstream già presente al commit $COMMIT"; exit 0
fi
rm -rf "$DIR"; mkdir -p "$DIR"
git -C "$DIR" init -q
git -C "$DIR" remote add origin https://github.com/numbas/Numbas.git
git -C "$DIR" fetch -q --depth 1 origin "$COMMIT"
git -C "$DIR" checkout -q FETCH_HEAD
echo "upstream pronto in $DIR al commit $(git -C "$DIR" rev-parse --short HEAD)"
