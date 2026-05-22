"use client";

import { useFormState, useFormStatus } from "react-dom";
import { runResearchQuery, type ResearchResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// EMR-688 — research search form. Accepts any number of words; the server
// action splits on whitespace internally so single tokens and full phrases
// both return results.
const schema = { minWords: 1, maxWords: 20 } as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="shrink-0">
      {pending ? "Searching…" : "Search evidence"}
    </Button>
  );
}

export function ResearchSearchForm() {
  const [state, formAction] = useFormState<ResearchResult | null, FormData>(
    runResearchQuery,
    null,
  );

  return (
    <form action={formAction}>
      <div className="flex items-center gap-3">
        <Input
          id="query"
          name="query"
          required
          minLength={2}
          maxLength={240}
          placeholder='e.g. "sleep" or "insomnia in people with OSA"'
          className="flex-1"
        />
        <SubmitButton />
      </div>
      <p className="mt-2 text-[11px] text-text-subtle">
        Multi-word queries supported · {schema.minWords}-{schema.maxWords}{" "}
        words · PubMed citations open in a new tab.
      </p>
      {state?.ok === false && (
        <p className="text-sm text-danger mt-3">{state.error}</p>
      )}
      {state?.ok && (
        <div className="flex items-center gap-2 mt-3">
          <Badge tone="success">Done</Badge>
          <p className="text-sm text-success">Results ready below.</p>
        </div>
      )}
    </form>
  );
}
