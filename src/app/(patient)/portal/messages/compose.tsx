"use client";

import { useFormState } from "react-dom";
import { useEffect, useRef } from "react";
import { sendReplyAction, createThreadAction } from "./actions";
import type { ReplyResult, NewThreadResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea, FieldGroup } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/lib/ui/form-helpers";

// ---------- Reply compose bar ----------

function ReplySubmitButton() {
  return <SubmitButton size="sm" idleLabel="Send" pendingLabel="Sending…" />;
}

export function ReplyCompose({ threadId }: { threadId: string }) {
  const [state, formAction] = useFormState<ReplyResult | null, FormData>(
    sendReplyAction,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="border-t border-border p-4 bg-surface"
    >
      <input type="hidden" name="threadId" value={threadId} />
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <Textarea
            name="body"
            rows={2}
            placeholder="Type your message..."
            required
            className="resize-none"
          />
        </div>
        <ReplySubmitButton />
      </div>
      {state?.ok === false && (
        <p className="text-xs text-danger mt-2">{state.error}</p>
      )}
    </form>
  );
}

// ---------- New thread compose ----------

function NewThreadSubmitButton() {
  return <SubmitButton size="sm" idleLabel="Send message" pendingLabel="Sending message…" />;
}

export function NewThreadCompose({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [state, formAction] = useFormState<NewThreadResult | null, FormData>(
    createThreadAction,
    null
  );

  if (!open) return null;

  return (
    <Card tone="raised" className="mb-6">
      <CardHeader>
        <CardTitle>New message</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <FieldGroup label="Subject" htmlFor="subject">
            <Input
              id="subject"
              name="subject"
              required
              placeholder="e.g. Question about my treatment plan"
            />
          </FieldGroup>
          <FieldGroup label="Message" htmlFor="body">
            <Textarea
              id="body"
              name="body"
              rows={4}
              required
              placeholder="Write your message to the care team..."
            />
          </FieldGroup>
          {state?.ok === false && (
            <p className="text-xs text-danger">{state.error}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <NewThreadSubmitButton />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
