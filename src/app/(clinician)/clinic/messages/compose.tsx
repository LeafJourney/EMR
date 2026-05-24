"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { sendClinicReplyAction } from "./actions";
import type { ReplyResult } from "./actions";
import { Button } from "@/components/ui/button";
import { DictationTextarea } from "@/components/ui/dictation-input";
import { useToast } from "@/components/ui/toast";

function ClinicReplySubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Sending..." : "Send"}
    </Button>
  );
}

export function ClinicReplyCompose({ threadId }: { threadId: string }) {
  const [state, formAction] = useFormState<ReplyResult | null, FormData>(
    sendClinicReplyAction,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();
  // Mirror the textarea value here so the dictation primitive can append
  // transcripts via its controlled onChange. The hidden input ferries the
  // value to the server action so the existing form contract is intact.
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      formRef.current?.reset();
      setBody("");
      toast({ title: "Reply sent", variant: "success" });
    } else {
      toast({
        title: "Couldn't send reply",
        description: state.error,
        variant: "error",
      });
    }
  }, [state, toast]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="border-t border-border p-4 bg-surface"
    >
      <input type="hidden" name="threadId" value={threadId} />
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <DictationTextarea
            name="body"
            rows={2}
            placeholder="Type your reply or tap the mic to dictate..."
            required
            className="resize-none"
            value={body}
            onChange={setBody}
            aria-label="Reply body"
          />
        </div>
        <ClinicReplySubmitButton />
      </div>
    </form>
  );
}
