/**
 * EMR-457 — Source connectors: CSV ingest (pure).
 *
 * The FHIR R4 source connector already exists (src/app/api/integrations/fhir);
 * this fills the CSV half of "ingest CSV records and stubbed FHIR R4
 * resources". It's pure: parse CSV text into header-keyed rows, then map each
 * row onto canonical field names using a MigrationProfile category's
 * `fieldMappings`. The HTTP route stages the result into a MigrationJob, which
 * the EMR-456 runner then imports.
 *
 * The parser follows RFC-4180: comma-delimited, double-quote-wrapped fields may
 * contain commas, embedded newlines, and escaped quotes (""). CRLF and LF line
 * endings are both accepted.
 */

export interface ParsedCsv {
  headers: string[];
  rows: Array<Record<string, string>>;
}

/** Field mapping for a category: sourceHeader → canonicalField. */
export type FieldMappings = Record<string, string>;

/**
 * Parse CSV text into header-keyed row objects. The first record is the header
 * row. Rows with fewer cells than headers pad with "" ; extra cells are kept
 * under a numeric `_extra_<n>` key so nothing is silently dropped. A blank
 * trailing line is ignored.
 */
export function parseCsv(text: string): ParsedCsv {
  const records = splitRecords(text);
  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];

  for (let r = 1; r < records.length; r++) {
    const cells = records[r];
    // Skip a fully-empty trailing record (single empty cell).
    if (cells.length === 1 && cells[0] === "") continue;
    const row: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = cells[c] ?? "";
    }
    for (let c = headers.length; c < cells.length; c++) {
      row[`_extra_${c}`] = cells[c];
    }
    rows.push(row);
  }

  return { headers, rows };
}

/** State-machine split of CSV text into records of cells (RFC-4180). */
function splitRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // Treat CRLF (and a bare CR) as one record terminator.
      pushRecord();
      i += text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (ch === "\n") {
      pushRecord();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // Flush the final field/record if the file didn't end with a newline.
  if (field.length > 0 || record.length > 0) {
    pushRecord();
  }

  return records;
}

/**
 * Map one parsed row onto canonical field names.
 *
 * With non-empty `mappings`, only mapped columns are emitted (sourceHeader →
 * canonicalField); a mapped source column that's absent yields "". With empty
 * mappings, the row passes through unchanged. Non-string mapping targets are
 * ignored (the strict shape lands with EMR-454).
 */
export function mapRow(
  row: Record<string, string>,
  mappings: FieldMappings,
): Record<string, string> {
  const entries = Object.entries(mappings).filter(
    ([, dest]) => typeof dest === "string" && dest.length > 0,
  );
  if (entries.length === 0) return { ...row };

  const out: Record<string, string> = {};
  for (const [src, dest] of entries) {
    out[dest] = row[src] ?? "";
  }
  return out;
}

/** Map every parsed row for a category through its field mappings. */
export function mapRowsForCategory(
  rows: Array<Record<string, string>>,
  mappings: FieldMappings,
): Array<Record<string, string>> {
  return rows.map((row) => mapRow(row, mappings));
}

/**
 * Extract a category's `fieldMappings` from a MigrationProfile.categories JSON
 * array. Returns {} when the category is absent or has no string-valued
 * mappings — callers then stage the raw parsed rows.
 */
export function fieldMappingsForCategory(
  categories: unknown,
  categorySlug: string,
): FieldMappings {
  if (!Array.isArray(categories)) return {};
  const match = categories.find(
    (c) =>
      c &&
      typeof c === "object" &&
      (c as Record<string, unknown>).slug === categorySlug,
  ) as Record<string, unknown> | undefined;
  const raw = match?.fieldMappings;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const out: FieldMappings = {};
  for (const [src, dest] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof dest === "string" && dest.length > 0) out[src] = dest;
  }
  return out;
}
