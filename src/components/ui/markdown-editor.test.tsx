import { describe, expect, it } from "vitest";
import { renderMarkdownToHtml } from "./markdown-editor";

// The renderer is the part of MarkdownEditor most likely to silently regress
// (markdown grammar changes, escape leaks, list mode transitions). We exercise
// the high-value paths here. The DOM interaction layer is small and trivially
// validated by manual testing; this suite is the safety net for the parser.

describe("renderMarkdownToHtml", () => {
  it("returns an empty string for whitespace input", () => {
    expect(renderMarkdownToHtml("")).toBe("");
    expect(renderMarkdownToHtml("   \n  ")).toBe("");
  });

  it("renders headings", () => {
    const html = renderMarkdownToHtml("# Title\n\n## Sub");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<h2>Sub</h2>");
  });

  it("renders bold and italic inline", () => {
    const html = renderMarkdownToHtml("This is **bold** and *italic*.");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders bullet and numbered lists with proper open/close", () => {
    const html = renderMarkdownToHtml("- one\n- two\n\n1. first\n2. second");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
    expect(html).toContain("</ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>first</li>");
    expect(html).toContain("<li>second</li>");
    expect(html).toContain("</ol>");
  });

  it("renders blockquotes", () => {
    const html = renderMarkdownToHtml("> hello world");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<p>hello world</p>");
    expect(html).toContain("</blockquote>");
  });

  it("renders horizontal rules", () => {
    expect(renderMarkdownToHtml("---")).toBe("<hr />");
  });

  it("renders fenced code blocks", () => {
    const html = renderMarkdownToHtml("```js\nconst x = 1;\n```");
    expect(html).toContain('<pre><code data-lang="js">');
    expect(html).toContain("const x = 1;");
  });

  it("renders inline code spans without breaking bold", () => {
    const html = renderMarkdownToHtml("Use `**bold**` syntax to **emphasize**.");
    // Inline code keeps its asterisks literal.
    expect(html).toContain("<code>**bold**</code>");
    // The real bold token still renders.
    expect(html).toContain("<strong>emphasize</strong>");
  });

  it("renders links with target=_blank and rel=noopener", () => {
    const html = renderMarkdownToHtml("See [docs](https://example.com).");
    expect(html).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">docs</a>',
    );
  });

  it("escapes HTML in source before applying transforms", () => {
    // Critical safety property — untrusted clinician/patient markdown can't
    // sneak in a <script> tag via the preview pane.
    const html = renderMarkdownToHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
