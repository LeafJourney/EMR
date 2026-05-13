/**
 * EMR-081 — OCR scan + auto-populate chart fields
 *
 * Pure TS extraction layer. Given OCR'd text from an outside record
 * (intake form, hospital discharge, lab printout, fax, ID card),
 * pull out structured fields that map onto our chart: demographics,
 * medications, allergies, vitals, problems, immunizations, and a
 * "free notes" bucket for everything we couldn't classify.
 *
 * The actual OCR (Vision API, Tesseract, etc.) is out of scope —
 * callers hand us the raw text and we hand back a draft chart patch
 * the clinician can review before we touch the database.
 */

export type ExtractedFieldKind =
  | "demographic"
  | "medication"
  | "allergy"
  | "vital"
  | "problem"
  | "immunization"
  | "lab"
  | "insurance"
  | "note";

export interface ExtractedField {
  kind: ExtractedFieldKind;
  /** Canonical chart field e.g. "dob", "medication.name", "vital.bp" */
  path: string;
  /** Verbatim OCR text the value came from — for clinician review */
  source: string;
  value: string;
  /** 0..1 confidence; <0.6 means clinician must confirm */
  confidence: number;
}

export interface OcrExtractInput {
  text: string;
  /** Optional hint about what kind of document this is */
  documentType?:
    | "intake_form"
    | "discharge_summary"
    | "lab_report"
    | "id_card"
    | "fax"
    | "unknown";
}

export interface OcrExtractResult {
  fields: ExtractedField[];
  /** Fields with confidence below the auto-fill threshold */
  needsReview: ExtractedField[];
  /** Anything we could not classify, kept verbatim for the chart note */
  residual: string;
}

const AUTO_FILL_THRESHOLD = 0.7;

const DOB_RE =
  /\b(?:dob|date of birth|birthdate|born)[:\s]*([01]?\d[/-][0-3]?\d[/-](?:19|20)\d{2})/i;
const PHONE_RE = /\(?\b(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/;
const MRN_RE = /\b(?:mrn|chart\s*#|medical\s*record\s*#?)[:\s]*([A-Z0-9-]{4,})/i;
const BP_RE = /\b(?:bp|blood pressure)[:\s]*(\d{2,3})\s*\/\s*(\d{2,3})/i;
const HR_RE = /\b(?:hr|heart rate|pulse)[:\s]*(\d{2,3})/i;
const TEMP_RE = /\b(?:temp|temperature)[:\s]*(\d{2,3}(?:\.\d)?)\s*°?\s*[fF]?/;
const WEIGHT_RE = /\b(?:wt|weight)[:\s]*(\d{2,3}(?:\.\d)?)\s*(lbs?|kg)/i;
const HEIGHT_RE = /\b(?:ht|height)[:\s]*(\d)['ʹ]\s*(\d{1,2})/i;
const ALLERGY_LINE_RE = /\b(?:allerg(?:y|ies))[:\s]*([^\n]{0,180})/i;
const MED_LINE_RE =
  /^\s*[-•*]?\s*([A-Z][a-zA-Z][a-zA-Z\-]+(?:\s+[A-Z]?[a-zA-Z\-]+)?)\s+(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|units?|iu)\b/m;
const ICD_RE = /\b([A-TV-Z]\d{2}(?:\.\d{1,4})?)\b/g;
const INSURANCE_RE =
  /\b(?:insurance|plan|payer|member id|policy)[:\s]*([A-Z0-9][\w\s\-#]{2,40})/i;

export function extractFromOcr(input: OcrExtractInput): OcrExtractResult {
  const text = input.text;
  const fields: ExtractedField[] = [];
  const consumedRanges: Array<[number, number]> = [];

  const claim = (start: number, end: number) =>
    consumedRanges.push([start, end]);

  // Demographics ─────────────────────────────────────────────
  const dob = DOB_RE.exec(text);
  if (dob) {
    fields.push({
      kind: "demographic",
      path: "dob",
      source: dob[0],
      value: normalizeDate(dob[1]),
      confidence: 0.92,
    });
    claim(dob.index, dob.index + dob[0].length);
  }

  const phone = PHONE_RE.exec(text);
  if (phone) {
    fields.push({
      kind: "demographic",
      path: "phone",
      source: phone[0],
      value: `(${phone[1]}) ${phone[2]}-${phone[3]}`,
      confidence: 0.88,
    });
    claim(phone.index, phone.index + phone[0].length);
  }

  const mrn = MRN_RE.exec(text);
  if (mrn) {
    fields.push({
      kind: "demographic",
      path: "externalMrn",
      source: mrn[0],
      value: mrn[1],
      confidence: 0.78,
    });
    claim(mrn.index, mrn.index + mrn[0].length);
  }

  // Vitals ───────────────────────────────────────────────────
  const bp = BP_RE.exec(text);
  if (bp) {
    fields.push({
      kind: "vital",
      path: "vital.bp",
      source: bp[0],
      value: `${bp[1]}/${bp[2]}`,
      confidence: 0.9,
    });
    claim(bp.index, bp.index + bp[0].length);
  }

  const hr = HR_RE.exec(text);
  if (hr) {
    fields.push({
      kind: "vital",
      path: "vital.hr",
      source: hr[0],
      value: hr[1],
      confidence: 0.84,
    });
    claim(hr.index, hr.index + hr[0].length);
  }

  const temp = TEMP_RE.exec(text);
  if (temp) {
    fields.push({
      kind: "vital",
      path: "vital.temp_f",
      source: temp[0],
      value: temp[1],
      confidence: 0.78,
    });
    claim(temp.index, temp.index + temp[0].length);
  }

  const weight = WEIGHT_RE.exec(text);
  if (weight) {
    const lbs =
      weight[2].toLowerCase().startsWith("kg")
        ? (parseFloat(weight[1]) * 2.20462).toFixed(1)
        : weight[1];
    fields.push({
      kind: "vital",
      path: "vital.weight_lbs",
      source: weight[0],
      value: lbs,
      confidence: 0.82,
    });
    claim(weight.index, weight.index + weight[0].length);
  }

  const height = HEIGHT_RE.exec(text);
  if (height) {
    const inches = parseInt(height[1], 10) * 12 + parseInt(height[2], 10);
    fields.push({
      kind: "vital",
      path: "vital.height_in",
      source: height[0],
      value: String(inches),
      confidence: 0.78,
    });
    claim(height.index, height.index + height[0].length);
  }

  // Allergies ────────────────────────────────────────────────
  const allergy = ALLERGY_LINE_RE.exec(text);
  if (allergy) {
    const list = allergy[1]
      .split(/[,;]| and /i)
      .map((s) => s.trim())
      .filter(
        (s) =>
          s.length > 1 &&
          !/^(none|nkda|no known)/i.test(s) &&
          !/^denies?$/i.test(s)
      );
    if (list.length === 0 && /nkda|none|no known/i.test(allergy[1])) {
      fields.push({
        kind: "allergy",
        path: "allergy",
        source: allergy[0],
        value: "NKDA",
        confidence: 0.9,
      });
    } else {
      for (const a of list) {
        fields.push({
          kind: "allergy",
          path: "allergy",
          source: allergy[0],
          value: a,
          confidence: 0.65,
        });
      }
    }
    claim(allergy.index, allergy.index + allergy[0].length);
  }

  // Medications ──────────────────────────────────────────────
  const medRegex = new RegExp(MED_LINE_RE.source, "gm");
  let medMatch: RegExpExecArray | null;
  while ((medMatch = medRegex.exec(text)) !== null) {
    fields.push({
      kind: "medication",
      path: "medication",
      source: medMatch[0].trim(),
      value: `${medMatch[1]} ${medMatch[2]}${medMatch[3].toLowerCase()}`,
      confidence: 0.72,
    });
    claim(medMatch.index, medMatch.index + medMatch[0].length);
  }

  // Problems via ICD-10 codes ────────────────────────────────
  let icdMatch: RegExpExecArray | null;
  const seenIcd = new Set<string>();
  while ((icdMatch = ICD_RE.exec(text)) !== null) {
    if (seenIcd.has(icdMatch[1])) continue;
    seenIcd.add(icdMatch[1]);
    fields.push({
      kind: "problem",
      path: "problem.icd10",
      source: icdMatch[0],
      value: icdMatch[1],
      confidence: 0.86,
    });
    claim(icdMatch.index, icdMatch.index + icdMatch[0].length);
  }

  // Insurance ────────────────────────────────────────────────
  const ins = INSURANCE_RE.exec(text);
  if (ins) {
    fields.push({
      kind: "insurance",
      path: "insurance.payer",
      source: ins[0],
      value: ins[1].trim(),
      confidence: 0.6,
    });
    claim(ins.index, ins.index + ins[0].length);
  }

  // Residual = whatever wasn't claimed by a structured extractor
  const residual = stripRanges(text, consumedRanges).trim();
  const needsReview = fields.filter((f) => f.confidence < AUTO_FILL_THRESHOLD);

  return { fields, needsReview, residual };
}

/** Build a chart patch the clinician can apply after review. */
export function toChartPatch(result: OcrExtractResult): {
  autoApply: ExtractedField[];
  review: ExtractedField[];
  noteAddendum: string;
} {
  return {
    autoApply: result.fields.filter((f) => f.confidence >= AUTO_FILL_THRESHOLD),
    review: result.needsReview,
    noteAddendum: result.residual
      ? `[OCR import — unparsed residual]\n${result.residual}`
      : "",
  };
}

function normalizeDate(raw: string): string {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(raw);
  if (!m) return raw;
  const [, mm, dd, yy] = m;
  const year = yy.length === 2 ? (parseInt(yy, 10) > 30 ? `19${yy}` : `20${yy}`) : yy;
  return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function stripRanges(text: string, ranges: Array<[number, number]>): string {
  if (ranges.length === 0) return text;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  let out = "";
  for (const [s, e] of sorted) {
    if (s > cursor) out += text.slice(cursor, s);
    cursor = Math.max(cursor, e);
  }
  if (cursor < text.length) out += text.slice(cursor);
  return out.replace(/\n{3,}/g, "\n\n");
}
