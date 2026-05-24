"use client";

/**
 * Tiny markdown renderer for help-drawer article bodies.
 *
 * Why a custom renderer rather than `react-markdown` /
 * `next-mdx-remote`?  The brief explicitly forbids adding deps, and
 * our articles use a narrow, predictable subset of markdown:
 *
 *   - paragraphs separated by blank lines
 *   - bullet lists with leading `- `
 *   - inline `**bold**` and `` `code` ``
 *
 * That's it. No headings, no images, no tables. If we ever need
 * richer formatting we can swap this for `react-markdown` behind
 * the same `<MarkdownLite>` interface.
 */

import * as React from "react";

interface MarkdownLiteProps {
  body: string;
}

interface Token {
  type: "text" | "bold" | "code";
  value: string;
}

/**
 * Split a single line into bold / code / text tokens. We walk the
 * string once and bite off the longest prefix that matches each
 * pattern, falling through to literal text otherwise. This keeps
 * the renderer dependency-free and small enough to audit.
 */
function tokenizeInline(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    if (line.startsWith("**", i)) {
      const end = line.indexOf("**", i + 2);
      if (end !== -1) {
        tokens.push({ type: "bold", value: line.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if (line[i] === "`") {
      const end = line.indexOf("`", i + 1);
      if (end !== -1) {
        tokens.push({ type: "code", value: line.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // Coalesce literal text up to the next special char.
    let j = i;
    while (j < line.length && line[j] !== "`" && !line.startsWith("**", j)) {
      j++;
    }
    if (j > i) tokens.push({ type: "text", value: line.slice(i, j) });
    if (j === i) j = i + 1; // safety against zero-width loop
    i = j;
  }
  return tokens;
}

function renderInline(line: string, keyPrefix: string): React.ReactNode[] {
  return tokenizeInline(line).map((tok, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (tok.type === "bold") {
      return (
        <strong key={key} className="font-semibold text-text">
          {tok.value}
        </strong>
      );
    }
    if (tok.type === "code") {
      return (
        <code
          key={key}
          className="rounded bg-surface-raised px-1 py-[1px] font-mono text-[0.85em] text-text"
        >
          {tok.value}
        </code>
      );
    }
    return <React.Fragment key={key}>{tok.value}</React.Fragment>;
  });
}

export function MarkdownLite({ body }: MarkdownLiteProps) {
  // Split on blank lines to get blocks; each block is either a
  // bullet list (every non-empty line begins with `- `) or a
  // paragraph.
  const blocks = body.split(/\n\s*\n/);

  return (
    <div className="space-y-3 text-sm leading-relaxed text-text-muted">
      {blocks.map((block, blockIdx) => {
        const lines = block.split("\n").filter((l) => l.trim().length > 0);
        const isList = lines.length > 0 && lines.every((l) => l.trim().startsWith("- "));

        if (isList) {
          return (
            <ul
              key={`block-${blockIdx}`}
              className="list-disc space-y-1 pl-5 marker:text-text-muted"
            >
              {lines.map((line, lineIdx) => (
                <li key={`block-${blockIdx}-li-${lineIdx}`}>
                  {renderInline(line.trim().slice(2), `b${blockIdx}-l${lineIdx}`)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`block-${blockIdx}`}>
            {lines.map((line, lineIdx) => (
              <React.Fragment key={`p-${blockIdx}-${lineIdx}`}>
                {lineIdx > 0 ? " " : null}
                {renderInline(line, `p${blockIdx}-l${lineIdx}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
