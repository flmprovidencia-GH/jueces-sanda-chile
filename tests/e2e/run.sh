#!/bin/bash
# Prueba de punta a punta con los emuladores de Firebase (requiere Java, Node y Playwright).
# Uso: bash tests/e2e/run.sh   → capturas en /tmp/sanda-e2e
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; OUT=/tmp/sanda-e2e; mkdir -p "$OUT"
(cd "$ROOT" && python3 -m http.server 8766 --bind 127.0.0.1 >/dev/null 2>&1 &) ; sleep 1
cd "$ROOT/tests/e2e"
cat > firebase.json <<J
{"database":{"rules":"../../database.rules.json"},"emulators":{"auth":{"port":9099},"database":{"port":9000},"ui":{"enabled":false},"singleProjectMode":true}}
J
npx -y firebase-tools@13.29.1 emulators:exec --project demo-sanda "node flujo-completo.cjs $OUT"
