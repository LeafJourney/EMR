// LinkifiedText — render plain-text strings with URLs, emails, phone numbers,
// and patient refs auto-converted to safe <a> elements.
//
// Hard rules:
//   - We NEVER inject raw HTML. Token text always passes through React, so
//     XSS payloads in user content stay as inert text.
//   - href values come exclusively from `linkifyText`, which validates schemes
//     (http/https/mailto/tel/internal-route only).
//   - External URLs open in a new tab with `rel="noopener noreferrer"` to
//     prevent reverse-tabnabbing.
//
// Usage:
//   <LinkifiedText text={note.body} />
//   <LinkifiedText text={message.body} maxLength={280} />

import Link from "next/link";
import * as React from "react";

import { type LinkToken, linkifyText } from "@/lib/ui/linkify";

const ELLIPSIS = "…";

export type LinkifiedTextProps = {
  text: string | null | undefined;
  /** Optional cap on visible characters; appends an ellipsis. */
  maxLength?: number;
  /** Forwarded to the wrapping span for utility-class styling. */
  className?: string;
  /** Forwarded to the wrapping span. */
  title?: string;
  /**
   * Override the element used for the wrapper. Default `"span"`. Useful when
   * the surrounding layout needs a block-level container (e.g. preserved
   * whitespace in chart notes).
   */
  as?: "span" | "div" | "p";
};

function truncateTokens(tokens: LinkToken[], max: number): LinkToken[] {
  let used = 0;
  const out: LinkToken[] = [];
  for (const t of tokens) {
    if (used >= max) break;
    const remaining = max - used;
    if (t.text.length <= remaining) {
      out.push(t);
      used += t.text.length;
      continue;
    }
    // Mid-token truncation: keep as plain text so we don't link a half-URL.
    out.push({ kind: "text", text: t.text.slice(0, remaining) + ELLIPSIS });
    used = max;
    break;
  }
  return out;
}

export function LinkifiedText({
  text,
  maxLength,
  className,
  title,
  as = "span",
}: LinkifiedTextProps) {
  if (text == null || text === "") return null;

  let tokens = linkifyText(text);
  if (maxLength && text.length > maxLength) {
    tokens = truncateTokens(tokens, maxLength);
  }

  const Wrapper = as;
  return (
    <Wrapper className={className} title={title}>
      {tokens.map((token, i) => renderToken(token, i))}
    </Wrapper>
  );
}

function renderToken(token: LinkToken, key: number): React.ReactNode {
  // React escapes children automatically — token.text is always treated as
  // plain text, never HTML.
  if (token.kind === "text" || !token.href) {
    return <React.Fragment key={key}>{token.text}</React.Fragment>;
  }

  if (token.kind === "ref") {
    // Internal patient route — use next/link for client-side navigation.
    return (
      <Link
        key={key}
        href={token.href}
        className="font-medium text-emerald-700 hover:underline"
      >
        {token.text}
      </Link>
    );
  }

  const isExternal = token.kind === "url";
  return (
    <a
      key={key}
      href={token.href}
      {...(isExternal
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      className="text-emerald-700 underline-offset-2 hover:underline"
      data-linkify-kind={token.kind}
    >
      {token.text}
    </a>
  );
}

export default LinkifiedText;
