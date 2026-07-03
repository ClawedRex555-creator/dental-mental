import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LEGAL_PDF_FIELD_CATALOG,
  LEGAL_PDF_FIELD_GROUP_LABELS,
  LEGAL_PDF_TEMPLATE_PRESETS,
} from "@/lib/legal-pdf-fields";

/** Справочник по шаблонам юр. документов — только для супер-админа */
export function LegalTemplateGuide() {
  return (
    <div className="space-y-6">
      <Card className="border-violet-200 bg-violet-50/50">
        <CardHeader>
          <CardTitle className="text-base text-violet-900">
            Пациент vs представитель — какой плейсхолдер куда
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-violet-950">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <code className="text-xs">{"{patient_full_name}"}</code> —{" "}
              <strong>всегда пациент</strong> (у ребёнка — имя ребёнка).
            </li>
            <li>
              <code className="text-xs">{"{patient_or_repr_fio}"}</code> /{" "}
              <code className="text-xs">{"{customer_full_name}"}</code> —{" "}
              <strong>сторона договора</strong>: взрослый подписывает сам → его ФИО; ребёнок →
              ФИО законного представителя.
            </li>
            <li>
              <code className="text-xs">{"{patient_repr_fio}"}</code> — строка{" "}
              <strong>«в случае подписания законным представителем введите ФИО»</strong>: заполняется
              только если пациент — ребёнок; у взрослого остаётся пустой.
            </li>
          </ul>
          <p className="text-xs text-violet-800">
            Не подставляйте {"{patient_or_repr_fio}"} в блок подписи представителя — у взрослого
            туда попадёт его же ФИО. Для отдельной строки представителя используйте{" "}
            {"{patient_repr_fio}"}, {"{patient_repr_pass}"}, {"{patient_repr_birth}"}.
          </p>
        </CardContent>
      </Card>

      <Card className="border-teal-200 bg-teal-50/50">
        <CardHeader>
          <CardTitle className="text-base text-teal-900">
            Word .docx с плейсхолдерами (рекомендуем, в т.ч. Mac)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-teal-950">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              В Word в местах для данных напишите <strong>обычный текст</strong> в фигурных скобках:{" "}
              <code className="text-xs">{"{patient_full_name}"}</code>,{" "}
              <code className="text-xs">{"{customer_full_name}"}</code>,{" "}
              <code className="text-xs">{"{patient_or_repr_fio}"}</code>,{" "}
              <code className="text-xs">{"{patient_or_repr_birth}"}</code>,{" "}
              <code className="text-xs">{"{patient_repr_birth}"}</code>,{" "}
              <code className="text-xs">{"{clinic_name}"}</code> — см. таблицу ниже.
            </li>
            <li>
              <strong>Файл → Сохранить</strong> как <strong>.docx</strong> (не PDF).
            </li>
            <li>
              Загрузите .docx в юр. отдел клиники — должно появиться «Найдено N плейсхолдеров».
            </li>
          </ol>
          <p className="text-xs">
            Вкладка «Разработчик» не нужна. PDF на Mac часто теряет поля формы — используйте .docx.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Альтернатива: PDF с полями формы (Word → «Разработчик»)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Word → <strong>Файл → Параметры → Настроить ленту</strong> → вкладка{" "}
              <strong>Разработчик</strong>.
            </li>
            <li>
              <strong>Разработчик → Элементы управления для предыдущих версий → Поле текста</strong>{" "}
              (иконка «ab|»). Не подчёркивание и не современное «Поле формы».
            </li>
            <li>
              Дважды щёлкните по полю → <strong>Свойства</strong> → <strong>Закладка</strong> → имя
              из таблицы (латиница, подчёркивания, до 20 символов).
            </li>
            <li>
              <strong>Файл → Сохранить как → PDF</strong> → «Для электронного распространения» (не
              «для печати»).
            </li>
          </ol>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Скан и бланк с подчёркиваниями без полей заполнить нельзя. В примечании к документу
            можно {"{{patient.fullName}}"} — только для текстовых бланков без файла.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Типовые наборы полей</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {LEGAL_PDF_TEMPLATE_PRESETS.map((preset) => (
            <div key={preset.title}>
              <p className="text-sm font-medium text-slate-900">{preset.title}</p>
              <p className="mt-1 flex flex-wrap gap-1">
                {preset.fields.map((f) => (
                  <code
                    key={f}
                    className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800"
                  >
                    {f}
                  </code>
                ))}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Справочник имён полей / плейсхолдеров</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="px-4 py-2 font-medium">Имя в Word / DOCX</th>
                <th className="px-4 py-2 font-medium">Группа</th>
                <th className="px-4 py-2 font-medium">Что подставится</th>
                <th className="px-4 py-2 font-medium">Подсказка</th>
              </tr>
            </thead>
            <tbody>
              {LEGAL_PDF_FIELD_CATALOG.map((field) => (
                <tr key={field.wordName} className="border-b border-slate-50">
                  <td className="px-4 py-2">
                    <code className="text-xs text-teal-800">{`{${field.wordName}}`}</code>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {LEGAL_PDF_FIELD_GROUP_LABELS[field.group]}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{field.label}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{field.hint ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
