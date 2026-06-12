import { PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PreflightLoading() {
  return (
    <PageShell maxWidth="max-w-[1320px]">
      <div className="mb-6">
        <Skeleton className="h-3 w-32 mb-3" />
        <Skeleton className="h-9 w-64 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <Card key={i} tone="raised">
            <CardContent className="pt-5 pb-5">
              <Skeleton className="h-9 w-16 mb-1" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} tone="raised">
            <CardContent className="py-5 flex items-center gap-5">
              <Skeleton className="h-11 w-[76px] rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-48 mb-2" />
                <Skeleton className="h-3 w-72" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
