# OpenVPN N3 — подключение к тестовому контуру

Для **live** SOAP к `b2b-demo.n3health.ru` нужен VPN. Файл `.ovpn` выдаёт N3 в [личном кабинете](https://lk.n3health.ru) (раздел VPN / подключение к тестовому стенду).

## Где подключать VPN

| Где крутится Emkaro | Где нужен OpenVPN |
|---------------------|-------------------|
| **Сервер** `tstom.emkaro.ru` | **На сервере** `201.51.0.171` |
| Локально `npm run dev` на Windows | **На этом Windows-ПК** |

Подпись CryptoPro идёт с Windows, но **запросы к N3** шлёт тот хост, где работает Next.js (Docker на сервере → VPN на сервере).

---

## Сервер (основной сценарий)

Конфиг уже лежит: `/opt/emkaro/vpn/b2b-makarova-1.ovpn`

```bash
ssh root@201.51.0.171
cd /opt/emkaro

# статус
bash scripts/n3-vpn.sh status

# подключить
bash scripts/n3-vpn.sh start

# проверка сети до N3
bash scripts/n3-vpn.sh test
```

### AUTH_FAILED

Если в логе `AUTH_FAILED`:

```bash
grep auth-user-pass /opt/emkaro/vpn/b2b-makarova-1.ovpn
```

Создайте `/opt/emkaro/vpn/n3-auth.txt` (логин и пароль **VPN из ЛК N3**, не SOAP):

```
логин_vpn
пароль_vpn
```

```bash
chmod 600 /opt/emkaro/vpn/n3-auth.txt
bash scripts/n3-vpn.sh restart
```

### Автозапуск после перезагрузки

```bash
cat > /etc/systemd/system/emkaro-n3-vpn.service <<'EOF'
[Unit]
Description=Emkaro N3 OpenVPN
After=network-online.target
Wants=network-online.target

[Service]
Type=forking
WorkingDirectory=/opt/emkaro
ExecStart=/bin/bash /opt/emkaro/scripts/n3-vpn.sh start
ExecStop=/bin/bash /opt/emkaro/scripts/n3-vpn.sh stop
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable emkaro-n3-vpn
systemctl start emkaro-n3-vpn
```

---

## Windows (если dev локально)

1. Установите **OpenVPN Connect** (Microsoft Store или [openvpn.net](https://openvpn.net/client/)).
2. Скачайте `.ovpn` из ЛК N3.
3. OpenVPN Connect → **Import** → выберите файл → **Connect**.
4. Введите логин/пароль VPN, если запросит.

Проверка в PowerShell:

```powershell
Invoke-WebRequest -Uri "http://b2b-demo.n3health.ru/emk/EMKService.svc" -UseBasicParsing -TimeoutSec 15
```

Не должно быть таймаута (HTTP 405/500 — нормально).

---

## После подключения VPN

1. Агент подписи на Windows (`9876`) — запущен.
2. Emkaro: Live + CryptoPro + N3 credentials в настройках клиники.
3. **Обработать очередь** СЭМД в UI.

См. также [EGISZ-TEST-WINDOWS.md](./EGISZ-TEST-WINDOWS.md).
