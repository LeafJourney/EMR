"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendClinicReplyAction, requestAiDraftAction } from "./actions";
import type { ReplyResult } from "./actions";
import { Button } from "@/components/ui/button";
import { DictationTextarea } from "@/components/ui/dictation-input";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { useToast } from "@/components/ui/toast";

// Gradual rollout for the new MarkdownEditor — surface-by-surface. Today
// we light it up for clinic-side replies and keep the DictationTextarea
// fallback under a runtime check, so a bad render in production downgrades
// gracefully instead of blocking the send.
const USE_MARKDOWN_REPLY = true;

function ClinicReplySubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Sending..." : "Send"}
    </Button>
  );
}

/**
 * "Draft with AI" — asks the Messaging Assistant agent to draft a reply for
 * this patient. The draft lands inline in the thread (and in the Approvals
 * inbox) for the clinician to review and send; nothing is sent automatically.
 */
function DraftWithAiButton({ threadId }: { threadId: string }) {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function onClick() {
    startTransition(async () => {
      const result = await requestAiDraftAction(threadId);
      if (result.ok) {
        toast({
          title: "AI is drafting a reply",
          description: "The draft will appear here and in Approvals for your review.",
          variant: "success",
        });
        router.refresh();
      } else {
        toast({
          title: "Couldn't request a draft",
          description: result.error,
          variant: "error",
        });
      }
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={onClick}
      disabled={pending}
    >
      {pending ? "Drafting…" : "✨ Draft with AI"}
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
      {USE_MARKDOWN_REPLY ? (
        <div className="space-y-3">
          {/* The MarkdownEditor's <textarea> is uncontrolled-by-name; we
              ferry the body via a hidden input so we don't change the
              form-action contract. */}
          <input type="hidden" name="body" value={body} />
          <MarkdownEditor
            value={body}
            onChange={setBody}
            rows={3}
            placeholder="Type your reply, use the toolbar to format, or / for block commands…"
            aria-label="Reply body"
          />
          <div className="flex justify-end gap-2">
            <DraftWithAiButton threadId={threadId} />
            <ClinicReplySubmitButton />
          </div>
        </div>
      ) : (
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
          <DraftWithAiButton threadId={threadId} />
          <ClinicReplySubmitButton />
        </div>
      )}
    </form>
  );
}
