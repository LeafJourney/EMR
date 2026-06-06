/**
 * EMR-986 — Sample document assets for the Documents inbox preview.
 *
 * These are self-contained data URIs (no network, no external services) used to
 * render the ACTUAL full-size document in the "View actual text" preview instead
 * of a synthetic mock. They stand in for the real scanned files that a wired-up
 * OCR pipeline would attach to each inbound document.
 */

/** Build an SVG "scanned insurance card" image as a data URI (renders in <img>). */
function insuranceCardSvg(opts: {
  carrier: string;
  memberId: string;
  group: string;
  subscriber: string;
  accent: string;
}): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#eef2f7"/>
    </linearGradient>
  </defs>
  <rect width="640" height="400" fill="url(#bg)"/>
  <rect x="0" y="0" width="640" height="70" fill="${opts.accent}"/>
  <text x="28" y="46" font-family="Georgia, serif" font-size="26" fill="#ffffff" font-weight="bold">${opts.carrier}</text>
  <text x="612" y="44" text-anchor="end" font-family="monospace" font-size="13" fill="#ffffff" opacity="0.85">HEALTH PLAN</text>
  <g font-family="monospace" fill="#1f2937">
    <text x="28" y="140" font-size="13" fill="#6b7280">MEMBER ID</text>
    <text x="28" y="168" font-size="22" font-weight="bold">${opts.memberId}</text>
    <text x="28" y="220" font-size="13" fill="#6b7280">GROUP #</text>
    <text x="28" y="248" font-size="22" font-weight="bold">${opts.group}</text>
    <text x="28" y="300" font-size="13" fill="#6b7280">SUBSCRIBER</text>
    <text x="28" y="328" font-size="22" font-weight="bold">${opts.subscriber}</text>
  </g>
  <rect x="0" y="360" width="640" height="40" fill="#f1f5f9"/>
  <text x="28" y="386" font-family="monospace" font-size="12" fill="#94a3b8">SCANNED DOCUMENT — OFFICIAL COPY</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** A minimal single-page PDF rendered as a data URI (renders in <embed>/<iframe>). */
export const SAMPLE_PDF_DATA_URI =
  "data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA2MTIgNzkyXS9SZXNvdXJjZXM8PC9Gb250PDwvRjEgNCAwIFI+Pj4+L0NvbnRlbnRzIDUgMCBSPj4KZW5kb2JqCjQgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCjUgMCBvYmoKPDwvTGVuZ3RoIDExMD4+CnN0cmVhbQpCVAovRjEgMTggVGYKNzIgNzAwIFRkCihFeHBsYW5hdGlvbiBvZiBCZW5lZml0cykgVGoKMCAtMzAgVGQKL0YxIDEyIFRmCihTY2FubmVkIGRvY3VtZW50IC0gb2ZmaWNpYWwgY29weSkgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDUgMDAwMDAgbiAKMDAwMDAwMDMxNSAwMDAwMCBuIAp0cmFpbGVyCjw8L1NpemUgNi9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjQ3NQolJUVPRgo=";

/** Sample card used by the in-client scan simulation (EMR-948/986). */
export const KAISER_SAMPLE_CARD = insuranceCardSvg({
  carrier: "KAISER PERMANENTE",
  memberId: "K99881122",
  group: "CA-992",
  subscriber: "Avery Hale",
  accent: "#006b54",
});

export const SAMPLE_DOCS = {
  aetnaCard: insuranceCardSvg({
    carrier: "AETNA",
    memberId: "W123456789",
    group: "0042-ABC",
    subscriber: "Maya Castillo",
    accent: "#7c2d92",
  }),
  bcbsEob: SAMPLE_PDF_DATA_URI,
  uhcCard: insuranceCardSvg({
    carrier: "UNITEDHEALTHCARE",
    memberId: "UHC-77891234",
    group: "GRP-44-OPT",
    subscriber: "Carla Wei",
    accent: "#0b5cab",
  }),
  cignaLetter: SAMPLE_PDF_DATA_URI,
};
