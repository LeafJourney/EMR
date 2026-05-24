// EMR-002/EMR-017 — geocoding utilities for dispensary locations.

export interface Coordinates {
  lat: number;
  lng: number;
}

export const DEFAULT_COORDS: Coordinates = { lat: 45.5152, lng: -122.6784 }; // Portland default

const MOCK_CITIES: Record<string, Coordinates> = {
  "seattle, wa": { lat: 47.6062, lng: -122.3321 },
  "san francisco, ca": { lat: 37.7749, lng: -122.4194 },
  "los angeles, ca": { lat: 34.0522, lng: -118.2437 },
  "portland, or": DEFAULT_COORDS,
};

export async function geocodeAddress(address: string): Promise<Coordinates> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    const normalized = address.toLowerCase().trim();
    for (const [city, coords] of Object.entries(MOCK_CITIES)) {
      if (normalized.includes(city)) return coords;
    }
    console.warn(`Geocode address "${address}" not found in mock dictionary. Falling back to Portland.`);
    return DEFAULT_COORDS;
  }

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
    );
    if (!res.ok) {
      console.warn(`Google Geocoding API returned status ${res.status}. Falling back to default coords.`);
      return DEFAULT_COORDS;
    }
    const data = await res.json();
    if (data.results && data.results[0]) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat, lng };
    }
    console.warn(`Google Geocoding API returned zero results. Falling back to default coords.`);
  } catch (e) {
    console.error("Geocoding failed, falling back to default coords", e);
  }
  return DEFAULT_COORDS;
}
