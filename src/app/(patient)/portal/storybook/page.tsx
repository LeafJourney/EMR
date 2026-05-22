import { PageShell } from "@/components/shell/PageHeader";
import { StorybookViewer } from "@/components/portal/storybook-viewer";
import { ApothecaryStrainCard } from "@/components/portal/strain-card";

export const metadata = { title: "My Storybook | Leafjourney" };

const CHAPTERS = [
  {
    id: "ch1",
    title: "The Beginning of the Journey",
    content: (
      <>
        <p>
          Welcome to your personalized Cannabis Care storybook. Every great journey starts with a single step, and yours begins here. You have chosen to explore the therapeutic potential of the plant, seeking balance and relief.
        </p>
        <p>
          This storybook will evolve as you log your outcomes, showing your progress and unlocking new chapters. You will learn about different cannabinoids, terpenes, and how they interact with your body's endocannabinoid system.
        </p>
        <div className="my-8 p-6 bg-amber-100/50 rounded-2xl border border-amber-200">
          <h3 className="text-xl font-semibold text-amber-900 mb-2">The Apothecary's Note</h3>
          <p className="text-amber-800 text-sm">
            "Patience is the highest virtue in this realm. Start low, go slow, and listen to the whispers of your body before they become shouts."
          </p>
        </div>
      </>
    )
  },
  {
    id: "ch2",
    title: "The First Strains",
    content: (
      <>
        <p>
          As you ventured further into the garden, you encountered the first strains chosen specifically for your condition. Each strain carries a unique profile of terpenes—the aromatic oils that give cannabis its distinctive scent and flavor, and profoundly shape its effects.
        </p>
        <p>
          We've prepared an Apothecary Strain Card for your currently prescribed products.
        </p>
        <div className="mt-8 flex justify-center">
          <ApothecaryStrainCard 
            name="Blue Dream"
            type="Sativa Dominant"
            thc={18}
            cbd={2}
            terpenes={["Myrcene", "Pinene", "Caryophyllene"]}
          />
        </div>
      </>
    )
  },
  {
    id: "ch3",
    title: "Consistency is Key",
    content: (
      <>
        <p>
          The magic of the endocannabinoid system lies in its ability to seek homeostasis. But this balance is not achieved overnight. It requires a steady hand and a consistent routine.
        </p>
        <p>
          By maintaining your streak and logging your check-ins, you provide the vital feedback needed to chart your course. Every data point is a lantern illuminating the path ahead.
        </p>
      </>
    )
  }
];

export default function StorybookPage() {
  return (
    <PageShell maxWidth="max-w-[1200px]" className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
      <StorybookViewer chapters={CHAPTERS} />
    </PageShell>
  );
}
