// Leafjourney Marketplace — core types
// These mirror the Prisma schema but work standalone for the static data layer.

export interface MarketplaceProduct {
  id: string;
  slug: string;
  name: string;
  brand: string;
  description: string;
  shortDescription: string;
  price: number;
  compareAtPrice?: number;
  status: "draft" | "active" | "archived" | "out_of_stock";
  format: ProductFormat;
  imageUrl?: string;
  images: string[];

  // Cannabinoid profile
  thcContent?: number;
  cbdContent?: number;
  cbnContent?: number;
  terpeneProfile?: Record<string, number>;
  strainType?: "indica" | "sativa" | "hybrid" | "n/a";

  // Use-case metadata
  symptoms: string[];
  goals: string[];
  useCases: string[];
  onsetTime?: string;
  duration?: string;
  // EMR-278 — descriptive effect tags ("uplifting", "relaxing", "cerebral").
  // Optional; PDP falls back to deriving from strain/cannabinoid/terpene
  // profile when missing.
  effectTags?: string[];

  // Dosage
  dosageGuidance?: string;
  beginnerFriendly: boolean;

  // Trust
  labVerified: boolean;
  coaUrl?: string;
  clinicianPick: boolean;
  clinicianNote?: string;
  requires21Plus?: boolean;

  // Inventory
  inStock: boolean;

  // Ratings
  averageRating: number;
  reviewCount: number;

  // Storefront UI — pre-formatted display values for the Leafmart shelf.
  // Optional; the UI mapper falls back to category/format-derived defaults.
  bgColor?: string;
  deepColor?: string;
  displayShape?: "bottle" | "can" | "jar" | "tin" | "serum" | "box";
  doseLabel?: string;
  outcomePct?: number;
  outcomeSampleSize?: number;

  // Features
  featured: boolean;
  categoryIds: string[];
  variants: ProductVariant[];
  reviews: ProductReview[];
}

export interface ProductVariant {
  id: string;
  name: string;
  upc?: string;
  price: number;
  compareAtPrice?: number;
  inStock: boolean;
}

export interface MarketplaceCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  type: "symptom" | "goal" | "format" | "collection";
  icon?: string;
  productCount: number;
}

export interface ProductReview {
  id: string;
  authorName: string;
  rating: number;
  title?: string;
  body?: string;
  verified: boolean;
  createdAt: string;
}

export interface CartItem {
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface CartState {
  items: CartItem[];
}

export type ProductFormat =
  | "tincture"
  | "flower"
  | "edible"
  | "topical"
  | "capsule"
  | "vape"
  | "concentrate"
  | "patch"
  | "beverage"
  | "serum";

export type SortOption = "featured" | "price-asc" | "price-desc" | "rating" | "newest";

export const FORMAT_LABELS: Record<ProductFormat, string> = {
  tincture: "Tincture",
  flower: "Flower",
  edible: "Edible",
  topical: "Topical",
  capsule: "Capsule",
  vape: "Vaporizer",
  concentrate: "Concentrate",
  patch: "Patch",
  beverage: "Beverage",
  serum: "Serum",
};

export const SYMPTOM_OPTIONS = [
  "Pain",
  "Sleep",
  "Anxiety",
  "Nausea",
  "Inflammation",
  "Appetite",
  "Headache",
  "Muscle tension",
] as const;

export const GOAL_OPTIONS = [
  "Calm",
  "Focus",
  "Recovery",
  "Sleep",
  "Energy",
  "Everyday wellness",
  "Pain support",
  "Women's health",
] as const;
