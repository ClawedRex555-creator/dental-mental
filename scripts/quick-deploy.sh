#!/bin/bash
# Quick install on Ubuntu 22/24 VPS
# Run from project root: bash scripts/quick-deploy.sh
set -euo pipefail

echo "=== Emkaro: quick deploy ==="

if [ ! -f "docker-compose.quick.yml" ]; then
  echo "Run this script from the project root (where docker-compose.quick.yml is)"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo ">>> Installing Docker..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y ca-certificates curl git unzip
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Error: Docker Compose v2 (docker compose) is required"
  exit 1
fi

if [ ! -f ".env" ]; then
  echo ">>> Creating .env from template..."
  cp .env.quick.example .env
  SECRET=$(openssl rand -base64 48 | tr -d '\n')
  DBPASS=$(openssl rand -base64 24 | tr -d '\n' | tr '/+' 'Aa')
  sed -i "s|AUTH_SECRET=.*|AUTH_SECRET=${SECRET}|" .env
  sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${DBPASS}|" .env
  echo ">>> Generated AUTH_SECRET and POSTGRES_PASSWORD in .env"
fi

echo ">>> Building and starting (5-15 min first time)..."
docker compose -f docker-compose.quick.yml up -d --build

echo ">>> Waiting for PostgreSQL and app..."
for i in $(seq 1 30); do
  if docker compose -f docker-compose.quick.yml exec -T postgres pg_isready -U mis -d dentalcloud >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
sleep 10

if ! docker compose -f docker-compose.quick.yml ps | grep -q "app.*Up"; then
  echo "Error: app container failed. Logs:"
  docker compose -f docker-compose.quick.yml logs app --tail 50
  exit 1
fi

echo ">>> Creating tstom clinic (if missing)..."
docker compose -f docker-compose.quick.yml exec -T app node scripts/create-clinic.mjs \
  --slug tstom \
  --name "Test Clinic" \
  --email admin@tstom.ru \
  --password "DemoTest123!" \
  --owner-name "Admin" \
  2>/dev/null || echo "(tstom clinic already exists - OK)"
IP=$(curl -4 -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo "============================================"
echo "  DONE"
echo "============================================"
echo ""
echo "  Open in browser:"
echo "    http://${IP}:3000/login"
echo ""
echo "  Login:  admin@tstom.ru"
echo "  Password: DemoTest123!"
echo ""
echo "  Open inbound TCP 3000 in VPS firewall!"
echo "  Logs: docker compose -f docker-compose.quick.yml logs -f app"
echo "============================================"
