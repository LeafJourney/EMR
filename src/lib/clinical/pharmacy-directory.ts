/**
 * EMR-892 — Preferred pharmacy directory
 *
 * Dr. Patel wants the e-prescribe "send to pharmacy" picker to autocomplete
 * against a curated directory of real pharmacies (chains + independents)
 * rather than forcing free text, so the right NPI and fax route every time.
 *
 * `searchPharmacies` does a partial, case-insensitive match across the
 * patient-facing fields (name, address, city, state, county, zip, phone) and
 * defaults to 10 results. Pure data + helper only — no React, no imports.
 */

export interface PharmacyEntry {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  county?: string;
  zip: string;
  phone: string;
  fax?: string;
  npi?: string;
}

export const PHARMACIES: readonly PharmacyEntry[] = [
  {
    id: "rx-001",
    name: "CVS Pharmacy #4821",
    address: "1201 Market St",
    city: "San Francisco",
    state: "CA",
    county: "San Francisco",
    zip: "94103",
    phone: "(415) 555-0142",
    fax: "(415) 555-0143",
    npi: "1356482910",
  },
  {
    id: "rx-002",
    name: "Walgreens #3310",
    address: "300 Geary St",
    city: "San Francisco",
    state: "CA",
    county: "San Francisco",
    zip: "94102",
    phone: "(415) 555-0188",
    fax: "(415) 555-0189",
    npi: "1487263500",
  },
  {
    id: "rx-003",
    name: "Rite Aid #5567",
    address: "2298 Mission St",
    city: "San Francisco",
    state: "CA",
    county: "San Francisco",
    zip: "94110",
    phone: "(415) 555-0220",
    fax: "(415) 555-0221",
    npi: "1598374621",
  },
  {
    id: "rx-004",
    name: "Mission Bay Compounding Pharmacy",
    address: "555 Mission Bay Blvd N",
    city: "San Francisco",
    state: "CA",
    county: "San Francisco",
    zip: "94158",
    phone: "(415) 555-0311",
    fax: "(415) 555-0312",
    npi: "1629485732",
  },
  {
    id: "rx-005",
    name: "CVS Pharmacy #2207",
    address: "2300 16th St",
    city: "Oakland",
    state: "CA",
    county: "Alameda",
    zip: "94612",
    phone: "(510) 555-0410",
    fax: "(510) 555-0411",
    npi: "1730596843",
  },
  {
    id: "rx-006",
    name: "Walgreens #1190",
    address: "3000 Broadway",
    city: "Oakland",
    state: "CA",
    county: "Alameda",
    zip: "94611",
    phone: "(510) 555-0455",
    fax: "(510) 555-0456",
    npi: "1841607954",
  },
  {
    id: "rx-007",
    name: "Grand Lake Family Pharmacy",
    address: "3250 Lakeshore Ave",
    city: "Oakland",
    state: "CA",
    county: "Alameda",
    zip: "94610",
    phone: "(510) 555-0509",
    fax: "(510) 555-0510",
    npi: "1952718065",
  },
  {
    id: "rx-008",
    name: "CVS Pharmacy #9914",
    address: "1799 University Ave",
    city: "Berkeley",
    state: "CA",
    county: "Alameda",
    zip: "94703",
    phone: "(510) 555-0612",
    fax: "(510) 555-0613",
    npi: "1063829176",
  },
  {
    id: "rx-009",
    name: "Elephant Pharmacy",
    address: "1607 Shattuck Ave",
    city: "Berkeley",
    state: "CA",
    county: "Alameda",
    zip: "94709",
    phone: "(510) 555-0677",
    fax: "(510) 555-0678",
    npi: "1174930287",
  },
  {
    id: "rx-010",
    name: "Walgreens #7720",
    address: "1444 W El Camino Real",
    city: "Mountain View",
    state: "CA",
    county: "Santa Clara",
    zip: "94040",
    phone: "(650) 555-0734",
    fax: "(650) 555-0735",
    npi: "1285041398",
  },
  {
    id: "rx-011",
    name: "Rite Aid #4402",
    address: "570 Showers Dr",
    city: "Mountain View",
    state: "CA",
    county: "Santa Clara",
    zip: "94040",
    phone: "(650) 555-0791",
    fax: "(650) 555-0792",
    npi: "1396152409",
  },
  {
    id: "rx-012",
    name: "Castro Street Pharmacy",
    address: "750 Castro St",
    city: "Mountain View",
    state: "CA",
    county: "Santa Clara",
    zip: "94041",
    phone: "(650) 555-0820",
    fax: "(650) 555-0821",
    npi: "1407263510",
  },
];

/**
 * Partial, case-insensitive search across name/address/city/state/county/
 * zip/phone. An empty query returns the head of the directory. Default limit
 * is 10.
 */
export function searchPharmacies(query: string, limit = 10): PharmacyEntry[] {
  const q = query.trim().toLowerCase();
  if (q === "") return PHARMACIES.slice(0, limit);

  const matches = PHARMACIES.filter((p) => {
    const haystack = [
      p.name,
      p.address,
      p.city,
      p.state,
      p.county ?? "",
      p.zip,
      p.phone,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  return matches.slice(0, limit);
}
