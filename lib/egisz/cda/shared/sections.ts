import {
  CDA_FIELD,
  CDA_FIELD_ANAMNESIS_TEXT,
  CDA_FIELD_NAMES,
  CDA_SECTION,
  CDA_SECTION_TITLES,
  DEFAULT_PATIENT_CONDITION_CODE,
  DEFAULT_PATIENT_CONDITION_NAME,
  DEFAULT_PLACE_CODE,
  DEFAULT_PLACE_NAME,
  DEFAULT_VISIT_KIND_CODE,
  DEFAULT_VISIT_KIND_NAME,
  NSI_CODED_FIELDS,
  NSI_CODED_FIELDS_VERSION,
  NSI_MED_SERVICES,
  NSI_MED_SERVICES_VERSION,
  NSI_MKB10,
  NSI_MKB10_VERSION,
  NSI_PATIENT_CONDITION,
  NSI_PATIENT_CONDITION_VERSION,
  NSI_PLACE_OF_CARE,
  NSI_PLACE_OF_CARE_VERSION,
  NSI_SECTIONS,
  NSI_SECTIONS_VERSION,
  NSI_VISIT_KIND,
  NSI_VISIT_KIND_VERSION,
} from "@/lib/egisz/cda/nsi-constants";
import type { ClinicalNarrative, CdaDocumentContext } from "@/lib/egisz/cda/shared/types";
import { xmlEscape } from "@/lib/egisz/cda/xml-utils";

export function sectionCodeXml(sectionCode: string): string {
  const title = CDA_SECTION_TITLES[sectionCode] ?? sectionCode;
  return `<code code="${sectionCode}" codeSystem="${NSI_SECTIONS}" codeSystemName="Секции электронных медицинских документов" codeSystemVersion="${NSI_SECTIONS_VERSION}" displayName="${xmlEscape(title)}"/>`;
}

function codedFieldXml(fieldCode: string, displayName?: string): string {
  const name = displayName ?? CDA_FIELD_NAMES[fieldCode] ?? fieldCode;
  return `<code code="${fieldCode}" codeSystem="${NSI_CODED_FIELDS}" codeSystemName="Кодируемые поля CDA документов" codeSystemVersion="${NSI_CODED_FIELDS_VERSION}" displayName="${xmlEscape(name)}"/>`;
}

export function textObservation(fieldCode: string, text: string): string {
  return `
    <entry>
      <observation classCode="OBS" moodCode="EVN">
        ${codedFieldXml(fieldCode)}
        <value xsi:type="ST">${xmlEscape(text)}</value>
      </observation>
    </entry>`;
}

export function codedObservation(
  fieldCode: string,
  valueCode: string,
  valueSystem: string,
  valueSystemName: string,
  valueSystemVersion: string,
  valueDisplay: string
): string {
  return `
    <entry>
      <observation classCode="OBS" moodCode="EVN">
        ${codedFieldXml(fieldCode)}
        <value xsi:type="CD" code="${xmlEscape(valueCode)}" codeSystem="${valueSystem}" codeSystemName="${xmlEscape(valueSystemName)}" codeSystemVersion="${valueSystemVersion}" displayName="${xmlEscape(valueDisplay)}"/>
      </observation>
    </entry>`;
}

export function diagnosisObservation(code: string, displayName: string): string {
  return codedObservation(
    CDA_FIELD.MKB10,
    code,
    NSI_MKB10,
    "Международная статистическая классификация болезней и проблем, связанных со здоровьем (10-й пересмотр)",
    NSI_MKB10_VERSION,
    displayName
  );
}

/** DGN: текстовый диагноз с кодом поля 806 (эталон SEMD 119) */
export function diagnosisTextObservation(displayName: string): string {
  return textObservation(CDA_FIELD.CONCLUSION, displayName);
}

export function nullFlavorSection(sectionCode: string): string {
  const title = CDA_SECTION_TITLES[sectionCode] ?? sectionCode;
  return `
    <component>
      <section nullFlavor="NI">
        ${sectionCodeXml(sectionCode)}
        <title>${xmlEscape(title)}</title>
      </section>
    </component>`;
}

export function textSection(sectionCode: string, text: string, fieldCode?: string): string {
  const title = CDA_SECTION_TITLES[sectionCode] ?? sectionCode;
  const entry = fieldCode ? textObservation(fieldCode, text) : "";
  return `
    <component>
      <section>
        ${sectionCodeXml(sectionCode)}
        <title>${xmlEscape(title)}</title>
        <text>${xmlEscape(text)}</text>
        ${entry}
      </section>
    </component>`;
}

export function serviceActSection(
  ctx: CdaDocumentContext,
  clinical: ClinicalNarrative
): string {
  return `
    <component>
      <section>
        ${sectionCodeXml(CDA_SECTION.SERVICES)}
        <title>${xmlEscape(CDA_SECTION_TITLES.SERVICES)}</title>
        <text>${xmlEscape(`${clinical.serviceCode} ${clinical.serviceName}`)}</text>
        <entry>
          <act classCode="ACT" moodCode="EVN">
            <code code="${xmlEscape(clinical.serviceCode)}" codeSystem="${NSI_MED_SERVICES}" codeSystemName="Номенклатура медицинских услуг" codeSystemVersion="${NSI_MED_SERVICES_VERSION}" displayName="${xmlEscape(clinical.serviceName)}"/>
            <effectiveTime value="${ctx.effectiveTime}"/>
          </act>
        </entry>
      </section>
    </component>`;
}

function diagnosisComponent(displayName: string): string {
  return `
        <component>
          <section>
            ${sectionCodeXml("DGN")}
            <title>${xmlEscape("Диагнозы")}</title>
            <text>${xmlEscape(displayName)}</text>
            ${diagnosisTextObservation(displayName)}
          </section>
        </component>`;
}

export function buildConsultationBody(ctx: CdaDocumentContext): string {
  const c = ctx.clinical;
  const docinfo = `
    <component>
      <section>
        ${sectionCodeXml(CDA_SECTION.DOCINFO)}
        <title>${xmlEscape(CDA_SECTION_TITLES.DOCINFO)}</title>
        <text>${xmlEscape(
          `МКБ-10: ${c.diagnosisCode} ${c.diagnosisDisplay}. Обращение: ${DEFAULT_VISIT_KIND_NAME}. Место: ${DEFAULT_PLACE_NAME}`
        )}</text>
        ${diagnosisObservation(c.diagnosisCode, c.diagnosisDisplay)}
        ${codedObservation(
          CDA_FIELD.VISIT_KIND,
          DEFAULT_VISIT_KIND_CODE,
          NSI_VISIT_KIND,
          "Вид случая госпитализации или обращения (первичный, повторный)",
          NSI_VISIT_KIND_VERSION,
          DEFAULT_VISIT_KIND_NAME
        )}
        ${codedObservation(
          CDA_FIELD.PLACE_OF_CARE,
          DEFAULT_PLACE_CODE,
          NSI_PLACE_OF_CARE,
          "Место оказания медицинской помощи",
          NSI_PLACE_OF_CARE_VERSION,
          DEFAULT_PLACE_NAME
        )}
      </section>
    </component>`;

  const rescons = `
    <component>
      <section>
        ${sectionCodeXml(CDA_SECTION.RESCONS)}
        <title>${xmlEscape(CDA_SECTION_TITLES.RESCONS)}</title>
        <text>${xmlEscape(
          `Жалобы: ${c.complaints}. Состояние: ${DEFAULT_PATIENT_CONDITION_NAME}. Объективно: ${c.objective}. Заключение: ${c.conclusion}. Диагноз: ${c.diagnosisDisplay}. Рекомендации: ${c.recommendations}`
        )}</text>
        ${codedObservation(
          CDA_FIELD.PATIENT_CONDITION,
          DEFAULT_PATIENT_CONDITION_CODE,
          NSI_PATIENT_CONDITION,
          "Степень тяжести состояния пациента",
          NSI_PATIENT_CONDITION_VERSION,
          DEFAULT_PATIENT_CONDITION_NAME
        )}
        ${textObservation(CDA_FIELD.OBJECTIVE, c.objective)}
        ${textObservation(CDA_FIELD.CONCLUSION, c.conclusion)}
        ${diagnosisComponent(c.diagnosisDisplay)}
      </section>
    </component>`;

  return `
      ${docinfo}
      ${textSection(CDA_SECTION.ANAM, c.diseaseAnamnesis, CDA_FIELD_ANAMNESIS_TEXT)}
      ${textSection(CDA_SECTION.LANAM, c.lifeAnamnesis, CDA_FIELD_ANAMNESIS_TEXT)}
      ${rescons}
      ${serviceActSection(ctx, c)}`;
}

export function buildReferralBody(ctx: CdaDocumentContext, targetOrg: string): string {
  const c = ctx.clinical;
  const reason = c.complaints || c.objective;
  return `
      ${textSection(CDA_SECTION.DOCINFO, `Направление из ${ctx.orgName}`)}
      ${textSection(
        CDA_SECTION.SCOPORG,
        targetOrg,
        CDA_FIELD.REFERRAL_REASON
      )}
      ${textSection(CDA_SECTION.ANAM, c.diseaseAnamnesis, CDA_FIELD.DISEASE_ANAMNESIS)}
      ${textSection(CDA_SECTION.COMPLNTS, c.complaints, CDA_FIELD.COMPLAINTS)}
      <component>
        <section>
          ${sectionCodeXml(CDA_SECTION.CONSULT)}
          <title>${xmlEscape(CDA_SECTION_TITLES.CONSULT)}</title>
          <text>${xmlEscape(`Диагноз: ${c.diagnosisDisplay}. Показания: ${reason}`)}</text>
          ${diagnosisObservation(c.diagnosisCode, c.diagnosisDisplay)}
          ${textObservation(CDA_FIELD.REFERRAL_REASON, reason)}
        </section>
      </component>
      ${serviceActSection(ctx, c)}`;
}

export function buildInstrumentalBody(ctx: CdaDocumentContext): string {
  const c = ctx.clinical;
  const findings = c.objective || c.conclusion;
  return `
      ${textSection(CDA_SECTION.DOCINFO, `Исследование: ${c.serviceName}`)}
      ${textSection(CDA_SECTION.COMPLNTS, c.complaints, CDA_FIELD.COMPLAINTS)}
      ${textSection(CDA_SECTION.ANAM, c.diseaseAnamnesis, CDA_FIELD.DISEASE_ANAMNESIS)}
      <component>
        <section>
          ${sectionCodeXml(CDA_SECTION.RESINFO)}
          <title>${xmlEscape(CDA_SECTION_TITLES.RESINFO)}</title>
          <text>${xmlEscape(findings)}</text>
          ${textObservation(CDA_FIELD.STUDY_RESULT, findings)}
          ${textObservation(CDA_FIELD.CONCLUSION, c.conclusion)}
        </section>
      </component>
      ${diagnosisObservation(c.diagnosisCode, c.diagnosisDisplay)}
      ${serviceActSection(ctx, c)}`;
}

export function buildTaxCertificateBody(ctx: CdaDocumentContext, totalAmount: number): string {
  const c = ctx.clinical;
  const amountText = `${totalAmount.toFixed(2)} RUB`;
  return `
      ${textSection(CDA_SECTION.DOCINFO, `Справка для налогового вычета. Плательщик: ${ctx.input.patient.lastName} ${ctx.input.patient.firstName}`)}
      ${textSection(CDA_SECTION.SUM, amountText, CDA_FIELD.PAYMENT_AMOUNT)}
      ${serviceActSection(ctx, c)}
      ${textSection(CDA_SECTION.CONSULT, `Оказаны услуги: ${c.serviceName}. Диагноз: ${c.diagnosisDisplay}`)}`;
}

export function buildEpicrisisBody(ctx: CdaDocumentContext): string {
  const c = ctx.clinical;
  const summary = `Жалобы: ${c.complaints}. Лечение: ${c.conclusion}. Исход: ${c.recommendations}`;
  return `
      ${textSection(CDA_SECTION.DOCINFO, `Амбулаторный случай ${ctx.encounterId}`)}
      ${textSection(CDA_SECTION.EPICRIS, summary)}
      ${textSection(CDA_SECTION.ANAM, c.diseaseAnamnesis, CDA_FIELD.DISEASE_ANAMNESIS)}
      <component>
        <section>
          ${sectionCodeXml(CDA_SECTION.CONSULT)}
          <title>${xmlEscape(CDA_SECTION_TITLES.CONSULT)}</title>
          <text>${xmlEscape(summary)}</text>
          ${diagnosisObservation(c.diagnosisCode, c.diagnosisDisplay)}
          ${textObservation(CDA_FIELD.CONCLUSION, c.conclusion)}
          ${textObservation(CDA_FIELD.COMPLAINTS, c.recommendations)}
        </section>
      </component>
      ${serviceActSection(ctx, c)}`;
}
