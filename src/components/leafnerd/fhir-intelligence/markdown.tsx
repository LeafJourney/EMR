"use client";
/* LEAFNERD — lightweight GitHub-flavored Markdown renderer.

   Self-contained (no runtime deps) so streamed assistant replies can render
   bold, italics, inline code, links, headings, ordered/unordered lists, code
   fences, blockquotes, horizontal rules, and GFM pipe tables.

   The parsing is split into two PURE functions — `parseBlocks` and
   `tokenizeInline` — that take a string and return plain data. They carry no
   React/DOM dependency so they are unit-testable under the node test env. The
   `<Markdown>` component is a thin view over their output and never uses
   `dangerouslySetInnerHTML`, so model/stream output can't inject markup. */
import React from "react";

// ---------------------------------------------------------------------------
// Inline tokens
// ---------------------------------------------------------------------------

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; value: string; href: string };

/**
 * Tokenize a single line of inline markdown. Pure + flat: nested emphasis is
 * resolved at render time by re-tokenizing the inner `value`, which keeps this
 * function simple to reason about and test.
 */
export function tokenizeInline(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let buf = "";
  let i = 0;
  const flush = () => {
    if (buf) {
      tokens.push({ type: "text", value: buf });
      buf = "";
    }
  };

  while (i < input.length) {
    const rest = input.slice(i);

    // Inline code first — its contents are literal.
    let m = /^`([^`]+)`/.exec(rest);
    if (m) {
      flush();
      tokens.push({ type: "code", value: m[1] });
      i += m[0].length;
      continue;
    }

    // Links: [label](href)
    m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (m) {
      flush();
      tokens.push({ type: "link", value: m[1], href: m[2] });
      i += m[0].length;
      continue;
    }

    // Bold: **text** or __text__
    m = /^(\*\*|__)(.+?)\1/.exec(rest);
    if (m) {
      flush();
      tokens.push({ type: "bold", value: m[2] });
      i += m[0].length;
      continue;
    }

    // Italic: *text* or _text_ (must wrap non-space so "a * b" stays literal)
    m = /^(\*|_)(?=\S)(.+?)\1/.exec(rest);
    if (m) {
      flush();
      tokens.push({ type: "italic", value: m[2] });
      i += m[0].length;
      continue;
    }

    buf += input[i];
    i += 1;
  }

  flush();
  return tokens;
}

// ---------------------------------------------------------------------------
// Block model
// ---------------------------------------------------------------------------

export type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "code"; lang: string | null; code: string }
  | { type: "quote"; text: string }
  | { type: "hr" };

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** Split a GFM table row into trimmed cells, dropping the wrapping pipes. */
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

/**
 * Parse a markdown document into a flat list of blocks. Pure — no React/DOM.
 * Deliberately small: handles the constructs the assistant emits, not the
 * entire CommonMark spec (no nested lists, footnotes, or reference links).
 */
export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line — separator.
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Fenced code block.
    const fence = /^```(.*)$/.exec(line.trim());
    if (fence) {
      const lang = fence[1].trim() || null;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && lines[i].trim() !== "```") {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // consume closing fence (or EOF)
      blocks.push({ type: "code", lang, code: body.join("\n") });
      continue;
    }

    // Horizontal rule.
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    // Heading.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2].trim().replace(/\s+#+\s*$/, ""),
      });
      i += 1;
      continue;
    }

    // GFM table: a header row followed by a separator row.
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      const header = splitRow(line);
      i += 2; // header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    // Blockquote.
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", text: quote.join(" ").trim() });
      continue;
    }

    // Lists (unordered or ordered).
    const unordered = /^\s*[-*+]\s+(.*)$/;
    const ordered = /^\s*\d+\.\s+(.*)$/;
    if (unordered.test(line) || ordered.test(line)) {
      const isOrdered = ordered.test(line);
      const matcher = isOrdered ? ordered : unordered;
      const items: string[] = [];
      while (i < lines.length && matcher.test(lines[i])) {
        items.push(matcher.exec(lines[i])![1].trim());
        i += 1;
      }
      blocks.push({ type: "list", ordered: isOrdered, items });
      continue;
    }

    // Paragraph — gather consecutive plain lines.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^```/.test(lines[i].trim()) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !unordered.test(lines[i]) &&
      !ordered.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1]))
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    if (para.length) blocks.push({ type: "paragraph", text: para.join(" ") });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return tokenizeInline(text).map((tok, idx) => {
    const key = `${keyPrefix}-${idx}`;
    switch (tok.type) {
      case "bold":
        return <strong key={key}>{renderInline(tok.value, key)}</strong>;
      case "italic":
        return <em key={key}>{renderInline(tok.value, key)}</em>;
      case "code":
        return <code key={key}>{tok.value}</code>;
      case "link":
        return (
          <a key={key} href={tok.href} target="_blank" rel="noopener noreferrer">
            {tok.value}
          </a>
        );
      default:
        return <React.Fragment key={key}>{tok.value}</React.Fragment>;
    }
  });
}

function renderBlock(block: Block, key: string): React.ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = `h${Math.min(block.level, 6)}` as keyof React.JSX.IntrinsicElements;
      return <Tag key={key}>{renderInline(block.text, key)}</Tag>;
    }
    case "paragraph":
      return <p key={key}>{renderInline(block.text, key)}</p>;
    case "list":
      return block.ordered ? (
        <ol key={key}>
          {block.items.map((it, j) => (
            <li key={j}>{renderInline(it, `${key}-${j}`)}</li>
          ))}
        </ol>
      ) : (
        <ul key={key}>
          {block.items.map((it, j) => (
            <li key={j}>{renderInline(it, `${key}-${j}`)}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <table key={key} className="ln-md-table">
          <thead>
            <tr>
              {block.header.map((h, j) => (
                <th key={j}>{renderInline(h, `${key}-h-${j}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c}>{renderInline(cell, `${key}-${r}-${c}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "code":
      return (
        <pre key={key}>
          <code>{block.code}</code>
        </pre>
      );
    case "quote":
      return <blockquote key={key}>{renderInline(block.text, key)}</blockquote>;
    case "hr":
      return <hr key={key} />;
    default:
      return null;
  }
}

/** Render trusted/AI markdown into themed React nodes. */
export function Markdown({ source }: { source: string }) {
  const blocks = React.useMemo(() => parseBlocks(source), [source]);
  return <div className="ln-md">{blocks.map((b, i) => renderBlock(b, `b-${i}`))}</div>;
}
