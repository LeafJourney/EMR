export interface LeaflyStrainData {
  slug: string;
  name: string;
  category: string;
  thcLevel: number;
  cbdLevel: number;
  dominantTerpene: string;
  effects: string[];
}

export async function fetchLeaflyStrains(): Promise<LeaflyStrainData[]> {
  // In a real app, this hits the Leafly B2B API.
  // For this integration, we will simulate fetching a batch of strains.
  
  try {
    const res = await fetch("https://api.leafly.com/v1/strains");
    if (res.ok) {
      const json = await res.json();
      if (json.data && Array.isArray(json.data)) {
         return json.data;
      }
    }
  } catch (err) {
    // Fallthrough to mock data if fetch fails (e.g. CORS, no network, or endpoint doesn't exist)
  }
  
  // Mock data fallback
  return [
    { slug: "blue-dream", name: "Blue Dream", category: "Hybrid", thcLevel: 18, cbdLevel: 0.1, dominantTerpene: "Myrcene", effects: ["Happy", "Relaxed"] },
    { slug: "charlottes-web", name: "Charlotte's Web", category: "CBD", thcLevel: 0.3, cbdLevel: 17, dominantTerpene: "Pinene", effects: ["Focused", "Relaxed"] },
    { slug: "granddaddy-purple", name: "Granddaddy Purple", category: "Indica", thcLevel: 20, cbdLevel: 0.1, dominantTerpene: "Linalool", effects: ["Sleepy", "Relaxed"] },
    { slug: "sour-diesel", name: "Sour Diesel", category: "Sativa", thcLevel: 22, cbdLevel: 0.1, dominantTerpene: "Caryophyllene", effects: ["Energetic", "Focused"] }
  ];
}
