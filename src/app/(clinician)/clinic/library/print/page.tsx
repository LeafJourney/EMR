import { Suspense } from "react";
import { AutoPrintTrigger } from "@/components/print/AutoPrintTrigger";
import { getCurrentUser } from "@/lib/auth/session";
import { getAllInteractions } from "@/lib/domain/drug-interactions";

export const metadata = { title: "Clinical Pharmacology Reference — print" };

const CANNABINOIDS = [
  {
    name: "THC",
    receptors: "CB1 (partial agonist), CB2",
    cyp: "CYP2C9, CYP3A4",
    effects: "Analgesia, antiemetic, appetite stimulation, anxiolysis (low dose), psychoactive",
  },
  {
    name: "CBD",
    receptors: "CB1 (negative allosteric modulator), 5-HT1A, TRPV1",
    cyp: "CYP2D6, CYP3A4, CYP2C19",
    effects: "Anxiolytic, anti-inflammatory, anticonvulsant, non-intoxicating",
  },
  {
    name: "CBN",
    receptors: "CB1 (weak), CB2",
    cyp: "CYP2C9",
    effects: "Mildly sedating, anti-inflammatory, appetite stimulation",
  },
  {
    name: "CBG",
    receptors: "CB1, CB2, 5-HT1A, TRPV1",
    cyp: "Limited data",
    effects: "Anxiolytic, anti-inflammatory, neuroprotective (emerging)",
  },
];

const TERPENES = [
  { name: "Myrcene", aroma: "Earthy, musky, herbal", targets: "CB1 (indirect)", effects: "Sedating, muscle relaxant, enhances THC psychoactivity" },
  { name: "Limonene", aroma: "Citrus, lemon, orange", targets: "5-HT1A, adenosine A2A", effects: "Mood elevation, stress relief, anxiolytic" },
  { name: "Pinene", aroma: "Pine, sharp, sweet", targets: "AChE inhibitor", effects: "Alertness, memory retention, bronchodilator" },
  { name: "Linalool", aroma: "Floral, lavender, spicy", targets: "GABA-A, 5-HT1A", effects: "Anxiolytic, sedative, anticonvulsant, pain relief" },
  { name: "Beta-Caryophyllene", aroma: "Pepper, spicy, woody", targets: "CB2 (full agonist)", effects: "Anti-inflammatory, analgesic, gastroprotective" },
  { name: "Humulene", aroma: "Hoppy, earthy, woody", targets: "CB1, CB2 (weak)", effects: "Anti-inflammatory, appetite suppressant" },
  { name: "Terpinolene", aroma: "Fresh, piney, floral", targets: "Limited data", effects: "Mildly sedating, antioxidant, antibacterial" },
  { name: "Ocimene", aroma: "Sweet, herbal, woody", targets: "Limited data", effects: "Antiviral, antifungal, anti-inflammatory" },
];

export default async function LibraryPrintPage() {
  const user = await getCurrentUser();
  const interactions = getAllInteractions().filter((i) => i.severity === "red" || i.severity === "yellow");
  const printedAt = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="print-document-frame">
      <article className="print-document">
        <Suspense fallback={null}>
          <AutoPrintTrigger />
        </Suspense>

        <header className="doc-header">
          <div>
            <div className="doc-eyebrow">Clinical Library</div>
            <h1 style={{ fontSize: "20pt", margin: "4px 0 6px", letterSpacing: "-0.01em", fontWeight: 600 }}>
              Pharmacology Reference
            </h1>
            <div style={{ fontSize: "10.5pt", color: "#444" }}>
              Cannabis medicine quick-reference — cannabinoids, terpenes, drug interactions
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: "10pt", color: "#444" }}>
            <div><strong style={{ color: "#111" }}>{user?.name ?? "Clinician"}</strong></div>
            <div style={{ marginTop: 4 }}>Printed {printedAt}</div>
          </div>
        </header>

        <section className="doc-section">
          <h2>Cannabinoid Pharmacology</h2>
          <table style={{ width: "100%", fontSize: "9pt", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ccc" }}>
                <th style={{ textAlign: "left", padding: "4px 8px 4px 0", color: "#666", fontWeight: 600 }}>Cannabinoid</th>
                <th style={{ textAlign: "left", padding: "4px 8px", color: "#666", fontWeight: 600 }}>Receptors</th>
                <th style={{ textAlign: "left", padding: "4px 8px", color: "#666", fontWeight: 600 }}>Key CYP enzymes</th>
                <th style={{ textAlign: "left", padding: "4px 0 4px 8px", color: "#666", fontWeight: 600 }}>Clinical effects</th>
              </tr>
            </thead>
            <tbody>
              {CANNABINOIDS.map((c) => (
                <tr key={c.name} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "5px 8px 5px 0", fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: "5px 8px", color: "#444" }}>{c.receptors}</td>
                  <td style={{ padding: "5px 8px", fontFamily: "monospace", fontSize: "8pt", color: "#444" }}>{c.cyp}</td>
                  <td style={{ padding: "5px 0 5px 8px", color: "#444" }}>{c.effects}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="doc-section">
          <h2>Terpene Pharmacology</h2>
          <table style={{ width: "100%", fontSize: "9pt", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ccc" }}>
                <th style={{ textAlign: "left", padding: "4px 8px 4px 0", color: "#666", fontWeight: 600 }}>Terpene</th>
                <th style={{ textAlign: "left", padding: "4px 8px", color: "#666", fontWeight: 600 }}>Aroma profile</th>
                <th style={{ textAlign: "left", padding: "4px 8px", color: "#666", fontWeight: 600 }}>Key targets</th>
                <th style={{ textAlign: "left", padding: "4px 0 4px 8px", color: "#666", fontWeight: 600 }}>Clinical effects</th>
              </tr>
            </thead>
            <tbody>
              {TERPENES.map((t) => (
                <tr key={t.name} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "5px 8px 5px 0", fontWeight: 600 }}>{t.name}</td>
                  <td style={{ padding: "5px 8px", color: "#444" }}>{t.aroma}</td>
                  <td style={{ padding: "5px 8px", fontFamily: "monospace", fontSize: "8pt", color: "#444" }}>{t.targets}</td>
                  <td style={{ padding: "5px 0 5px 8px", color: "#444" }}>{t.effects}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="doc-section">
          <h2>Drug Interactions — Red &amp; Yellow flags</h2>
          <table style={{ width: "100%", fontSize: "9pt", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ccc" }}>
                <th style={{ textAlign: "left", padding: "4px 8px 4px 0", color: "#666", fontWeight: 600 }}>Drug</th>
                <th style={{ textAlign: "left", padding: "4px 8px", color: "#666", fontWeight: 600 }}>Cannabinoid</th>
                <th style={{ textAlign: "left", padding: "4px 8px", color: "#666", fontWeight: 600 }}>Severity</th>
                <th style={{ textAlign: "left", padding: "4px 0 4px 8px", color: "#666", fontWeight: 600 }}>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {interactions.map((i) => (
                <tr key={`${i.drug}|${i.cannabinoid}`} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "5px 8px 5px 0", fontWeight: 600, textTransform: "capitalize" }}>{i.drug}</td>
                  <td style={{ padding: "5px 8px", fontFamily: "monospace", fontSize: "8pt", color: "#444" }}>{i.cannabinoid}</td>
                  <td style={{ padding: "5px 8px", color: i.severity === "red" ? "#c0392b" : "#d97706", fontWeight: 600 }}>
                    {i.severity === "red" ? "Contraindicated" : "Caution"}
                  </td>
                  <td style={{ padding: "5px 0 5px 8px", color: "#444" }}>{i.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="doc-footer">
          <div>
            <div style={{ fontSize: "8pt", color: "#666" }}>
              For informational use only. Verify dosing and interactions with current clinical references before prescribing.
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div>LeafJourney EMR — Clinical Library</div>
            <div>Printed {printedAt}</div>
          </div>
        </footer>
      </article>
    </div>
  );
}
