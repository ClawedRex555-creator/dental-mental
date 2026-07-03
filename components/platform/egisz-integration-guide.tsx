import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CDA_CONSULTATION_REV4_NSI,
  CDA_CONSULTATION_TEMPLATE_OID,
  NSI_OID_MED_DOCUMENT_TYPES,
} from "@/lib/egisz/nsi/document-type-hints";
import { DEFAULT_N3_TEST_GATEWAY } from "@/lib/egisz/types";

/** Справочник по N3 / ЕГИСЗ / НСИ — только для супер-админа */
export function EgiszIntegrationGuide() {
  const t = CDA_CONSULTATION_REV4_NSI;

  return (
    <div className="space-y-6">
      <Card className="border-teal-200 bg-teal-50/50">
        <CardHeader>
          <CardTitle className="text-base text-teal-900">Платформа Emkaro и N3</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-teal-950">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              N3 привязывает Emkaro как МИС автоматически по учётным данным клиники. Отдельный
              System ID в настройках не требуется.
            </li>
            <li>
              У каждой клиники — отдельное юр. лицо, OID организации и credentials N3. Админ
              клиники заполняет их в поддомене → Настройки → N3 / ЕГИСЗ.
            </li>
            <li>
              Режим <strong>stub</strong> — тест CDA и очереди без SOAP. <strong>live</strong> —
              реальная отправка в N3 от имени этой медицинской организации.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-violet-200 bg-violet-50/50">
        <CardHeader>
          <CardTitle className="text-base text-violet-900">
            Справочник НСИ 1.2.643.2.69.1.1.1.195 — типы мед. документов
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-violet-950">
          <p>
            В SOAP <code className="text-xs">AddMedRecord</code> передаётся{" "}
            <strong>IdMedDocumentType</strong>, не <code className="text-xs">remd_code</code> (код
            СЭМД).
          </p>
          <div className="overflow-x-auto rounded-lg border border-violet-200 bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-violet-100 text-left">
                <tr>
                  <th className="px-3 py-2">Поле</th>
                  <th className="px-3 py-2">Значение для стоматологического СЭМД Emkaro</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-violet-100">
                  <td className="px-3 py-2 font-medium">OID шаблона CDA</td>
                  <td className="px-3 py-2 font-mono">{CDA_CONSULTATION_TEMPLATE_OID}</td>
                </tr>
                <tr className="border-t border-violet-100">
                  <td className="px-3 py-2 font-medium">IdMedDocumentType</td>
                  <td className="px-3 py-2">
                    <strong>{t.idMedDocumentType}</strong> — {t.name}
                  </td>
                </tr>
                <tr className="border-t border-violet-100">
                  <td className="px-3 py-2 font-medium">remd_code (СЭМД)</td>
                  <td className="px-3 py-2">
                    <strong>{t.remd_code}</strong> — не подставлять в IdMedDocumentType
                  </td>
                </tr>
                <tr className="border-t border-violet-100">
                  <td className="px-3 py-2 font-medium">mime_type_remd</td>
                  <td className="px-3 py-2">{t.mime_type_remd}</td>
                </tr>
                <tr className="border-t border-violet-100">
                  <td className="px-3 py-2 font-medium">FhirCode</td>
                  <td className="px-3 py-2 font-mono">{t.fhirCode}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-violet-800">
            Другие редакции «Протокол консультации (CDA)» в том же справочнике: ред.5 →{" "}
            <strong>316</strong> (remd 227), ред.7 → <strong>372</strong> (remd 290). Для OID
            шаблона <code className="text-xs">.181</code> используется <strong>198</strong>.
          </p>
          <p className="text-xs text-violet-800">
            Локальная копия каталога (367 записей, версия 374):{" "}
            <code className="text-xs">data/nsi/{NSI_OID_MED_DOCUMENT_TYPES}.json</code>. Импорт из
            xlsx: <code className="text-xs">python3 scripts/import-nsi-195-from-xlsx.py …</code>
          </p>
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader>
          <CardTitle className="text-base text-amber-900">Тестовый контур N3 и VPN</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-amber-950">
          <p>
            Тестовый SOAP: <code className="text-xs">{DEFAULT_N3_TEST_GATEWAY}</code>. Справочники
            НСИ на <code className="text-xs">b2b-demo.n3health.ru</code> доступны только через
            OpenVPN N3.
          </p>
          <ul className="list-disc space-y-2 pl-5 text-xs">
            <li>
              <strong>Сервер</strong> (продакшен Emkaro) — VPN нужен:{" "}
              <code className="text-xs">bash scripts/n3-vpn.sh start</code>
            </li>
            <li>
              <strong>Mac/Windows клиники</strong> — свой OpenVPN не нужен; подпись с Windows идёт
              через SSH-туннель, не через VPN на ПК
            </li>
            <li>
              Просмотр справочника с Mac:{" "}
              <code className="text-xs">bash scripts/nsi-browser-tunnel.sh</code> →{" "}
              <code className="text-xs">
                https://127.0.0.1:18443/nsiui/Dictionary/{NSI_OID_MED_DOCUMENT_TYPES}
              </code>
            </li>
          </ul>
          <p className="text-xs">
            Без VPN на сервере SOAP к b2b-demo часто недоступен — перед live-отправкой подключите
            OpenVPN из ЛК N3 (файл .ovpn).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Что заполняет админ клиники</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <div>
            <p className="font-medium text-slate-800">Учётные данные N3 (ЛК n3health.ru)</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              <li>GUID МО, idLPU, login, password — из личного кабинета N3</li>
              <li>OID организации (ЕГИСЗ) — юр. лицо клиники</li>
              <li>
                OID типа CDA — по умолчанию{" "}
                <code className="text-xs">{CDA_CONSULTATION_TEMPLATE_OID}</code> (IdMedDocumentType{" "}
                {t.idMedDocumentType})
              </li>
              <li>ID информационной системы (МИС) N3 определяет автоматически — вводить не нужно</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-slate-800">Подпись CDA (КЭП)</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              <li>
                Личная КЭП врача — в карточке сотрудника (Сотрудники → врач → ЕГИСЗ / N3)
              </li>
              <li>КЭП организации (отпечаток) — в настройках N3 клиники, один на юр. лицо</li>
              <li>
                Режим CryptoPro на сервере требует <code className="text-xs">EGISZ_SIGNING_URL</code>{" "}
                (агент КриптоПро)
              </li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-slate-800">Очередь СЭМД</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              <li>
                «Автоматически ставить СЭМД в очередь» — при сохранении медкарты с диагнозом
              </li>
              <li>
                В режиме <strong>live</strong> отправка только если при визите («Пришёл») пациент
                выбрал «Да, отправить» в окне документов
              </li>
              <li>Обработка очереди и повтор ошибок — в настройках N3 клиники</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
