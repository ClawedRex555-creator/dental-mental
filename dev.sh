#!/bin/zsh
# Запуск DentalCloud MIS (локальный Node из .tools)
ROOT="$(cd "$(dirname "$0")" && pwd)"
export PATH="$ROOT/.tools/node-v22.14.0-darwin-arm64/bin:$PATH"
cd "$ROOT"

unset MallocStackLogging 2>/dev/null

echo "→ DentalCloud MIS"
echo "→ Папка: $ROOT"
echo "→ После «Ready» открой: http://127.0.0.1:3000/dashboard"
echo "→ Остановка: Ctrl+C"
echo ""

# ./dev.sh         — Webpack (стабильно, по умолчанию)
# ./dev.sh clean   — удалить .next и запустить
# ./dev.sh turbo   — Turbopack (быстрее, но кэш иногда ломается)
case "${1:-}" in
  clean)
    rm -rf .next node_modules/.cache
    echo "→ Кэш очищен"
    exec npm run dev
    ;;
  turbo)
    exec npm run dev:turbo
    ;;
  *)
    exec npm run dev
    ;;
esac
