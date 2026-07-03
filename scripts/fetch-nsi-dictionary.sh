#!/bin/bash
# Проверка доступа к справочнику НСИ через VPN на сервере.
# Полная выгрузка — вручную через UI (нужен логин N3), см. docs/N3-NSI-DICTIONARIES.md
#
#   bash scripts/fetch-nsi-dictionary.sh [oid]
#   bash scripts/nsi-browser-tunnel.sh   # с Mac — открыть в браузере
set -euo pipefail

OID="${1:-1.2.643.2.69.1.1.1.195}"
ROOT="${DEPLOY_ROOT:-/opt/emkaro}"
BASE="${N3_NSI_BASE:-https://b2b-demo.n3health.ru}"

bash "${ROOT}/scripts/n3-vpn.sh" status || bash "${ROOT}/scripts/n3-vpn.sh" start

echo ">>> Проверка UI справочника ${OID} ..."
code="$(curl -sk --connect-timeout 20 -o /dev/null -w '%{http_code}' "${BASE}/nsiui/Dictionary/${OID}")"
echo "HTTP ${code} — ${BASE}/nsiui/Dictionary/${OID}"

if [ "$code" != "200" ]; then
  echo "Нет доступа. Поднимите VPN: bash scripts/n3-vpn.sh start"
  exit 1
fi

echo ""
echo "Сеть до НСИ есть. Для просмотра/экспорта:"
echo "  На сервере: откройте URL выше в браузере через SSH-туннель с Mac."
echo "  С Mac:      bash scripts/nsi-browser-tunnel.sh"
echo "  Экспорт:    ${BASE}/nsiimportexport (логин из ЛК N3)"
echo ""
echo "Локальная копия известных кодов: data/nsi/$(echo "$OID" | tr '.' '_').json"
