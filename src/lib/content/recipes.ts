/**
 * Cannabis-infused recipe library — EMR-089
 *
 * Hand-curated recipes that pair a cannabis edible (infused oil, butter,
 * tincture, etc.) with an anti-inflammatory or terpene-friendly meal.
 * Pure data only — the page renders them; there is no LLM dependency.
 *
 * Dosing math is illustrative — never present these as precise doses.
 * Patients should always titrate from their prescribed regimen.
 */

export type RecipeCourse =
  | "breakfast"
  | "main"
  | "snack"
  | "drink"
  | "dessert";

export type RecipeDiet = "vegan" | "vegetarian" | "gluten-free" | "dairy-free";

export interface Recipe {
  id: string;
  title: string;
  blurb: string;
  course: RecipeCourse;
  diets: RecipeDiet[];
  difficulty: "easy" | "medium" | "advanced";
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  /** Approx mg THC per serving — pre-decarbed flower into infused oil. */
  approxMgPerServing: number;
  ingredients: string[];
  steps: string[];
  /** Why a clinician might suggest this — one short sentence. */
  whyItHelps: string;
  /** Tags for browsing — terpenes, conditions, intent. */
  tags: string[];
}

export const RECIPES: Recipe[] = [
  {
    id: "golden-milk",
    title: "Golden Milk with Cannabis Tincture",
    blurb:
      "A warm, anti-inflammatory bedtime drink — turmeric, ginger, and a measured drop of CBD-forward tincture.",
    course: "drink",
    diets: ["vegan", "gluten-free"],
    difficulty: "easy",
    prepMinutes: 2,
    cookMinutes: 6,
    servings: 1,
    approxMgPerServing: 5,
    ingredients: [
      "1 cup oat or coconut milk",
      "1 tsp turmeric",
      "½ tsp grated fresh ginger",
      "Pinch of black pepper",
      "1 tsp honey or maple",
      "Cannabis tincture, your prescribed dose",
    ],
    steps: [
      "Warm the milk in a small saucepan — do not boil.",
      "Whisk in turmeric, ginger, and pepper. Simmer 5 minutes.",
      "Off heat, stir in sweetener.",
      "Pour into a mug and dose tincture last, off the stove.",
    ],
    whyItHelps:
      "Turmeric + black pepper boosts curcumin absorption; warm fat improves cannabinoid uptake. A gentle pre-bed ritual.",
    tags: ["sleep", "anti-inflammatory", "myrcene", "evening"],
  },
  {
    id: "infused-olive-oil",
    title: "Slow-Infused Olive Oil",
    blurb:
      "The pantry workhorse — a low-and-slow olive oil infusion you can drizzle over anything for the rest of the week.",
    course: "main",
    diets: ["vegan", "gluten-free", "dairy-free"],
    difficulty: "medium",
    prepMinutes: 10,
    cookMinutes: 120,
    servings: 24,
    approxMgPerServing: 4,
    ingredients: [
      "1 cup high-quality olive oil",
      "7g decarboxylated cannabis flower (decarb 240°F / 40 min)",
      "Cheesecloth + small jar",
    ],
    steps: [
      "Combine oil and decarbed flower in a slow cooker on low (or a saucepan held at 180–200°F).",
      "Hold the temperature for 2 hours, stirring occasionally.",
      "Strain through cheesecloth into a sealed jar.",
      "Refrigerate. Use within 2 months.",
    ],
    whyItHelps:
      "A reliable, neutral-tasting base for any meal — especially Mediterranean salads, hummus, and roasted vegetables.",
    tags: ["base", "low-temp", "kitchen-staple"],
  },
  {
    id: "anti-inflammatory-bowl",
    title: "Anti-Inflammatory Grain Bowl",
    blurb:
      "Roasted veg, leafy greens, salmon or chickpeas, and a finishing drizzle of infused olive oil.",
    course: "main",
    diets: ["gluten-free"],
    difficulty: "easy",
    prepMinutes: 15,
    cookMinutes: 25,
    servings: 2,
    approxMgPerServing: 4,
    ingredients: [
      "1 cup cooked quinoa or brown rice",
      "1 cup roasted broccoli or sweet potato",
      "Handful of spinach",
      "Salmon fillet OR ½ cup chickpeas",
      "1 tsp infused olive oil per serving (drizzle to finish)",
      "Lemon, salt, pepper",
    ],
    steps: [
      "Roast veg at 425°F for 20–25 minutes.",
      "Cook protein of choice.",
      "Build the bowl: grain → greens → veg → protein.",
      "Drizzle infused oil last. Heat will not destroy — but extreme heat reduces potency.",
    ],
    whyItHelps:
      "Omega-3-rich proteins, leafy greens, and turmeric-friendly veg pair with cannabis to reduce systemic inflammation.",
    tags: ["pain", "inflammation", "omega-3", "lunch"],
  },
  {
    id: "calming-cocoa",
    title: "Calming Cocoa with CBD",
    blurb:
      "A small cup of dark cocoa and CBD oil for a quiet evening — anandamide-friendly chemistry in a mug.",
    course: "drink",
    diets: ["vegan", "gluten-free"],
    difficulty: "easy",
    prepMinutes: 2,
    cookMinutes: 5,
    servings: 1,
    approxMgPerServing: 10,
    ingredients: [
      "1 cup oat milk",
      "1 tbsp unsweetened cocoa",
      "½ tsp cinnamon",
      "1 tsp maple",
      "Your prescribed CBD oil dose",
    ],
    steps: [
      "Warm milk gently.",
      "Whisk in cocoa, cinnamon, maple.",
      "Off heat, stir in CBD oil.",
    ],
    whyItHelps:
      "Cocoa contains compounds that gently inhibit anandamide breakdown — the body's own endocannabinoid.",
    tags: ["anxiety", "evening", "CBD"],
  },
  {
    id: "morning-smoothie",
    title: "Recovery Morning Smoothie",
    blurb:
      "Berries, spinach, banana, almond butter, and a low-dose CBD tincture — a breakfast that earns its name.",
    course: "breakfast",
    diets: ["vegan", "gluten-free", "dairy-free"],
    difficulty: "easy",
    prepMinutes: 5,
    cookMinutes: 0,
    servings: 1,
    approxMgPerServing: 5,
    ingredients: [
      "1 cup frozen berries",
      "Handful of spinach",
      "½ banana",
      "1 tbsp almond butter",
      "1 cup oat milk",
      "Your prescribed CBD dose",
    ],
    steps: [
      "Blend everything except the tincture until smooth.",
      "Pour, then dose tincture into the glass and stir briefly.",
    ],
    whyItHelps:
      "Antioxidant berries + leafy greens + healthy fat = good cannabinoid bioavailability and an easy gentle wake-up.",
    tags: ["morning", "antioxidant", "CBD"],
  },
  {
    id: "infused-honey",
    title: "Cannabis-Infused Honey",
    blurb:
      "A spoonful in tea, on toast, or over yogurt. Holds well in the fridge for months.",
    course: "snack",
    diets: ["gluten-free", "dairy-free"],
    difficulty: "medium",
    prepMinutes: 5,
    cookMinutes: 60,
    servings: 16,
    approxMgPerServing: 3,
    ingredients: [
      "1 cup raw honey",
      "3.5g decarbed flower",
      "Small mason jar + double-boiler",
    ],
    steps: [
      "Combine honey and decarbed flower in a sealed mason jar.",
      "Place in a double-boiler at 160–180°F for 1 hour, lid loose.",
      "Strain through cheesecloth back into the jar.",
      "Cool, seal, refrigerate.",
    ],
    whyItHelps:
      "A microdose-friendly base for tea or toast — easy to titrate by the half-teaspoon.",
    tags: ["microdose", "kitchen-staple", "evening"],
  },
  // ── Wave 9+ expansion (EMR-089): cover Mediterranean, Italian, Mexican,
  //    Ayurvedic, vegan, and keto cuisines. ────────────────────────────────
  {
    id: "mediterranean-grain-bowl",
    title: "Mediterranean Grain Bowl",
    blurb:
      "Farro, lemony herbs, kalamata olives, and feta — drizzled with infused olive oil for an unhurried lunch.",
    course: "main",
    diets: ["vegetarian"],
    difficulty: "easy",
    prepMinutes: 10,
    cookMinutes: 15,
    servings: 2,
    approxMgPerServing: 4,
    ingredients: [
      "1 cup cooked farro (or quinoa)",
      "1 cup cherry tomatoes, halved",
      "½ cucumber, diced",
      "¼ cup kalamata olives",
      "¼ cup crumbled feta",
      "2 tbsp infused olive oil",
      "1 tbsp lemon juice",
      "Handful chopped parsley + mint",
    ],
    steps: [
      "Cook farro per package; cool slightly.",
      "Toss with tomatoes, cucumber, olives, and feta.",
      "Whisk infused olive oil with lemon juice; pour over.",
      "Finish with herbs, salt, and pepper.",
    ],
    whyItHelps:
      "The Mediterranean pattern is the single most-studied anti-inflammatory diet — and easy fat-with-cannabinoid uptake.",
    tags: ["mediterranean", "anti-inflammatory", "lunch", "myrcene"],
  },
  {
    id: "ayurvedic-kitchari",
    title: "Ayurvedic Kitchari",
    blurb:
      "A gentle one-pot rice-and-mung-dal stew with turmeric, ginger, and cumin — Ayurveda's everyday reset.",
    course: "main",
    diets: ["vegan", "vegetarian", "gluten-free", "dairy-free"],
    difficulty: "easy",
    prepMinutes: 5,
    cookMinutes: 35,
    servings: 4,
    approxMgPerServing: 3,
    ingredients: [
      "½ cup split yellow mung dal",
      "½ cup basmati rice",
      "1 tbsp infused ghee (or olive oil)",
      "1 tsp cumin seeds",
      "1 tsp turmeric",
      "1 tsp grated ginger",
      "4 cups water or broth",
      "Salt, cilantro, lemon",
    ],
    steps: [
      "Rinse dal and rice until water runs clear.",
      "In a heavy pot, bloom cumin seeds in infused fat 30 seconds.",
      "Add turmeric, ginger, dal, rice, and water. Bring to boil.",
      "Reduce, cover, simmer 30 minutes until porridge-soft.",
      "Salt, finish with cilantro and a squeeze of lemon.",
    ],
    whyItHelps:
      "Sattvic and easy on the gut — Ayurveda treats kitchari as both food and medicine. The infused ghee carries cannabinoids well.",
    tags: ["ayurvedic", "gut-friendly", "comfort", "evening"],
  },
  {
    id: "italian-zucchini-pasta",
    title: "Italian Zucchini Ribbon Pasta",
    blurb:
      "Spaghetti tossed with garlicky zucchini ribbons, lemon zest, and basil — infused olive oil as the finishing pour.",
    course: "main",
    diets: ["vegetarian"],
    difficulty: "easy",
    prepMinutes: 10,
    cookMinutes: 15,
    servings: 2,
    approxMgPerServing: 5,
    ingredients: [
      "6 oz dried spaghetti",
      "2 small zucchini, ribboned with a peeler",
      "3 cloves garlic, sliced thin",
      "2 tbsp olive oil (regular)",
      "1 tbsp infused olive oil",
      "Zest of 1 lemon",
      "Handful torn basil",
      "Parmesan, salt, chili flakes",
    ],
    steps: [
      "Cook spaghetti; reserve ½ cup pasta water.",
      "Sauté garlic in regular olive oil over medium until fragrant.",
      "Add zucchini ribbons; toss 90 seconds — keep them al dente.",
      "Add drained pasta, lemon zest, basil, and a splash of pasta water.",
      "Off-heat, drizzle infused olive oil. Finish with parmesan and chili.",
    ],
    whyItHelps:
      "Mediterranean staples; the infused oil goes in off-heat so cannabinoids stay intact.",
    tags: ["italian", "mediterranean", "weeknight"],
  },
  {
    id: "mexican-black-bean-tacos",
    title: "Mexican Black Bean Tacos",
    blurb:
      "Charred corn tortillas, smoky black beans, lime crema, and a drizzle of infused chili oil.",
    course: "main",
    diets: ["vegetarian", "gluten-free"],
    difficulty: "easy",
    prepMinutes: 10,
    cookMinutes: 10,
    servings: 2,
    approxMgPerServing: 4,
    ingredients: [
      "1 can black beans, drained",
      "1 tsp cumin + ½ tsp smoked paprika",
      "6 corn tortillas",
      "½ avocado, sliced",
      "Pickled red onions",
      "Cotija or feta",
      "2 tbsp infused olive oil whisked with 1 tsp chili flakes",
      "Lime + cilantro",
    ],
    steps: [
      "Warm beans with cumin and paprika; mash slightly.",
      "Char tortillas over a flame or dry skillet.",
      "Fill tortillas with beans, avocado, pickled onion, and cheese.",
      "Drizzle with infused chili oil and squeeze lime over the top.",
    ],
    whyItHelps:
      "Folate-rich legumes with a controlled microdose — bright, satisfying, and weeknight-fast.",
    tags: ["mexican", "weeknight", "anti-inflammatory"],
  },
  {
    id: "keto-avocado-toast",
    title: "Keto Avocado Cloud",
    blurb:
      "Almond-flour cracker base under smashed avocado, soft-boiled egg, and a flake of sea salt — low-carb, high-fat.",
    course: "breakfast",
    diets: ["vegetarian", "gluten-free"],
    difficulty: "easy",
    prepMinutes: 8,
    cookMinutes: 10,
    servings: 1,
    approxMgPerServing: 5,
    ingredients: [
      "2 store-bought almond-flour crackers (or seed crackers)",
      "½ ripe avocado",
      "1 soft-boiled egg",
      "1 tsp infused olive oil",
      "Lemon, chili flakes, flaky sea salt",
    ],
    steps: [
      "Smash avocado with lemon juice and salt.",
      "Spread onto crackers.",
      "Halve the soft-boiled egg, lay over the top.",
      "Drizzle infused oil and finish with chili and salt.",
    ],
    whyItHelps:
      "High-fat base for fat-soluble cannabinoids; keeps blood sugar steady through the morning.",
    tags: ["keto", "breakfast", "low-carb"],
  },
  {
    id: "vegan-overnight-oats",
    title: "Vegan Berry Overnight Oats",
    blurb:
      "Rolled oats soaked in oat milk with chia, mixed berries, and a swirl of infused honey alternative for a gentle morning lift.",
    course: "breakfast",
    diets: ["vegan", "gluten-free", "dairy-free"],
    difficulty: "easy",
    prepMinutes: 5,
    cookMinutes: 0,
    servings: 1,
    approxMgPerServing: 3,
    ingredients: [
      "½ cup rolled oats (gluten-free if needed)",
      "¾ cup oat milk",
      "1 tbsp chia seeds",
      "1 tsp maple syrup",
      "½ tsp infused coconut oil (warmed to liquid, then stirred in)",
      "Mixed berries, walnuts",
    ],
    steps: [
      "Stir oats, oat milk, chia, maple, and infused coconut oil in a jar.",
      "Lid on, fridge overnight.",
      "Top with berries and walnuts in the morning.",
    ],
    whyItHelps:
      "Fiber-forward, gut-friendly, and a controlled microdose to take with you out the door.",
    tags: ["vegan", "breakfast", "fiber", "microdose"],
  },
];

export function recipesByCourse(course: RecipeCourse): Recipe[] {
  return RECIPES.filter((r) => r.course === course);
}

export function recipesByTag(tag: string): Recipe[] {
  return RECIPES.filter((r) => r.tags.includes(tag));
}

/** All unique tags across the library, sorted alphabetically. */
export function allRecipeTags(): string[] {
  const tags = new Set<string>();
  RECIPES.forEach((r) => r.tags.forEach((t) => tags.add(t)));
  return Array.from(tags).sort();
}
