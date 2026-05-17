# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: click-handlers.spec.ts >> Click handlers — find-and-fix pass 8 >> crawl /
- Location: e2e/click-handlers.spec.ts:406:9

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForTimeout: Target page, context or browser has been closed
```

# Test source

```ts
  192 |       const aria = el.getAttribute("aria-label");
  193 |       if (aria && aria.trim()) return aria.trim();
  194 |       const labelledBy = el.getAttribute("aria-labelledby");
  195 |       if (labelledBy) {
  196 |         const t = labelledBy
  197 |           .split(/\s+/)
  198 |           .map((id) => document.getElementById(id)?.textContent ?? "")
  199 |           .join(" ")
  200 |           .trim();
  201 |         if (t) return t;
  202 |       }
  203 |       const title = el.getAttribute("title");
  204 |       if (title && title.trim()) return title.trim();
  205 |       const txt = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  206 |       if (txt) return txt;
  207 |       // Icon buttons sometimes only have an <img alt>
  208 |       const img = el.querySelector("img[alt]");
  209 |       if (img) return img.getAttribute("alt")!.trim();
  210 |       return "";
  211 |     }
  212 | 
  213 |     return interactive.map((el) => ({
  214 |       selector: cssPath(el),
  215 |       text: accessibleName(el).slice(0, 80),
  216 |       tagRole: `${el.tagName.toLowerCase()}${
  217 |         el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : ""
  218 |       }`,
  219 |     }));
  220 |   });
  221 | }
  222 | 
  223 | async function clickAndObserve(
  224 |   context: BrowserContext,
  225 |   routeUrl: string,
  226 |   probe: ElementProbe,
  227 | ): Promise<Finding[]> {
  228 |   const local: Finding[] = [];
  229 |   const page = await context.newPage();
  230 |   const consoleErrors: string[] = [];
  231 |   const failed: { url: string; status: number; method: string }[] = [];
  232 |   let dialogText: string | null = null;
  233 |   let threw: Error | null = null;
  234 |   let crashed = false;
  235 | 
  236 |   page.on("console", (msg) => {
  237 |     if (msg.type() === "error") {
  238 |       const t = msg.text();
  239 |       if (t.includes("Failed to load resource")) return;
  240 |       if (t.includes("[Fast Refresh]")) return;
  241 |       consoleErrors.push(t);
  242 |     }
  243 |   });
  244 |   page.on("requestfailed", (req) => {
  245 |     if (req.url().includes("/_next/")) return;
  246 |     const u = new URL(req.url());
  247 |     let host: string;
  248 |     try {
  249 |       host = new URL(page.url()).host;
  250 |     } catch {
  251 |       host = "localhost:3000";
  252 |     }
  253 |     if (u.host !== host) return;
  254 |     failed.push({ url: req.url(), status: 0, method: req.method() });
  255 |   });
  256 |   page.on("response", (res) => {
  257 |     if (res.status() >= 400 && res.status() !== 404) {
  258 |       if (res.url().startsWith(page.url())) return;
  259 |       failed.push({
  260 |         url: res.url(),
  261 |         status: res.status(),
  262 |         method: res.request().method(),
  263 |       });
  264 |     }
  265 |   });
  266 |   page.on("dialog", (dialog) => {
  267 |     dialogText = `${dialog.type()}: ${dialog.message()}`.slice(0, 200);
  268 |     dialog.dismiss().catch(() => {});
  269 |   });
  270 |   page.on("crash", () => {
  271 |     crashed = true;
  272 |   });
  273 | 
  274 |   try {
  275 |     await page.goto(routeUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
  276 |     const locator = page.locator(probe.selector).first();
  277 |     // Some elements register but become non-visible after hydration —
  278 |     // probe-vs-click race. Skip silently.
  279 |     const isVisible = await locator.isVisible({ timeout: 1500 }).catch(() => false);
  280 |     if (!isVisible) {
  281 |       await page.close();
  282 |       return local;
  283 |     }
  284 |     // Click; capture if it throws. Use `force: false` so we honor real
  285 |     // pointer rules. trial:false (default) — actually dispatch.
  286 |     await locator.click({ timeout: 5_000, noWaitAfter: true });
  287 |   } catch (err) {
  288 |     threw = err as Error;
  289 |   }
  290 | 
  291 |   // Give handlers a beat to fire — fetch calls, dialogs, route changes
> 292 |   await page.waitForTimeout(CLICK_OBSERVE_MS);
      |              ^ Error: page.waitForTimeout: Target page, context or browser has been closed
  293 | 
  294 |   const landed = page.url();
  295 |   let landedStatus: number | null = null;
  296 |   if (landed !== routeUrl && landed.startsWith("http")) {
  297 |     // We navigated. Use HEAD-equivalent fetch to capture the landed URL's
  298 |     // status. (Page.goto already followed redirects, so we re-fetch raw.)
  299 |     try {
  300 |       const u = new URL(landed);
  301 |       const res = await page.request.get(u.pathname + u.search, {
  302 |         maxRedirects: 0,
  303 |         failOnStatusCode: false,
  304 |         timeout: 5_000,
  305 |       });
  306 |       landedStatus = res.status();
  307 |     } catch {
  308 |       // ignore — page-level findings will catch crashes
  309 |     }
  310 |   }
  311 | 
  312 |   if (crashed) {
  313 |     local.push({
  314 |       url: routeUrl,
  315 |       selector: probe.selector,
  316 |       text: probe.text,
  317 |       kind: "page_crash",
  318 |       severity: "high",
  319 |       evidence: `Click crashed renderer. Target: ${landed}`,
  320 |     });
  321 |   }
  322 | 
  323 |   if (threw) {
  324 |     local.push({
  325 |       url: routeUrl,
  326 |       selector: probe.selector,
  327 |       text: probe.text,
  328 |       kind: "click_threw",
  329 |       severity: "med",
  330 |       evidence: threw.message.slice(0, 200),
  331 |     });
  332 |   }
  333 | 
  334 |   if (!probe.text || probe.text.length === 0) {
  335 |     local.push({
  336 |       url: routeUrl,
  337 |       selector: probe.selector,
  338 |       text: "(empty)",
  339 |       kind: "empty_accessible_name",
  340 |       severity: "med",
  341 |       evidence: `${probe.tagRole} has no aria-label / title / text — screen readers will announce it as just its tag`,
  342 |     });
  343 |   }
  344 | 
  345 |   for (const ce of consoleErrors) {
  346 |     local.push({
  347 |       url: routeUrl,
  348 |       selector: probe.selector,
  349 |       text: probe.text,
  350 |       kind: "console_error_on_click",
  351 |       severity: "med",
  352 |       evidence: ce.slice(0, 300),
  353 |     });
  354 |   }
  355 | 
  356 |   for (const fr of failed) {
  357 |     local.push({
  358 |       url: routeUrl,
  359 |       selector: probe.selector,
  360 |       text: probe.text,
  361 |       kind: "failed_request_on_click",
  362 |       severity: fr.status >= 500 ? "high" : "med",
  363 |       evidence: `${fr.method} ${fr.url} → ${fr.status || "network failure"}`,
  364 |     });
  365 |   }
  366 | 
  367 |   if (dialogText) {
  368 |     local.push({
  369 |       url: routeUrl,
  370 |       selector: probe.selector,
  371 |       text: probe.text,
  372 |       kind: "unhandled_dialog",
  373 |       severity: "low",
  374 |       evidence: dialogText,
  375 |     });
  376 |   }
  377 | 
  378 |   if (landedStatus !== null) {
  379 |     if (landedStatus >= 500) {
  380 |       local.push({
  381 |         url: routeUrl,
  382 |         selector: probe.selector,
  383 |         text: probe.text,
  384 |         kind: "navigated_to_5xx",
  385 |         severity: "high",
  386 |         evidence: `click navigated to ${landed} (HTTP ${landedStatus})`,
  387 |       });
  388 |     } else if (landedStatus === 404) {
  389 |       local.push({
  390 |         url: routeUrl,
  391 |         selector: probe.selector,
  392 |         text: probe.text,
```