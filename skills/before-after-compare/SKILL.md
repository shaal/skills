---
name: before-after-compare
description: >-
  Generate a self-contained before/after visual comparison page for UI changes.
  Captures "before" (deployed/staging or a baseline build) and "after" (the local
  build) screenshots of each changed region with agent-browser, then assembles a
  side-by-side HTML report with a one-line explanation per change. Use when the
  user asks for a before/after comparison page, a visual change report, a "show me
  before and after" page, screenshots of changes side by side, or a QA/review page
  that ties UI fixes (e.g. Jira tickets) to before/after evidence.
---

# before-after-compare

Build a single, portable HTML page that puts **before** and **after** screenshots
side by side — one row per change, each with a one-line explanation. Great for PR
evidence, client/QA review, and closing visual tickets.

The output is **one self-contained `.html` file** (images inlined as base64), so it
can be moved, attached, or opened from anywhere.

## When to use

- "Make me a before/after page for these changes."
- "Show the fix before and after, with screenshots from staging."
- "I want a visual review page for these tickets."

This skill is for **before vs after of a real change** (deployed/baseline vs local).
It is not a pixel diff against a design file. For that, use a dedicated design-diff
tool or skill if one is installed.

Paths in this skill are relative to the skill's own folder. Run the bundled
generator by absolute path: `node <skill_dir>/build-comparison.mjs ...`.

**Requirements:** Node.js 18+ (for the generator), the
[`agent-browser`](https://github.com/vercel-labs/agent-browser) CLI (for capture), and
Python 3 with Pillow (for cropping).

## The workflow

1. **Identify the changes** and a one-line explanation for each (often one per ticket).
2. **Pick the two sources:**
   - **After** = the local build the user is iterating on (e.g. `npm run build` + a
     local preview server, or the dev server). Confirm it's serving the new code.
   - **Before** = whatever shows the *old* state: the deployed/staging URL (the user's
     changes aren't live there yet), or — if there's no deployment — `git stash` /
     a previous commit built into a second dir. Staging is usually behind HTTP Basic
     Auth (see below).
3. **Capture matched screenshots** of each region, BEFORE and AFTER, using the
   identical framing recipe (below). Save to a working dir (e.g. `screenshots/<id>/`).
   Prefer a folder your repo already gitignores so the shots don't get committed.
4. **Verify each shot** by Reading it — confirm the before actually shows the bug and
   the after shows it fixed. Re-frame if a sticky header covered the target. Then
   **`md5sum` the pairs**: identical hashes mean you captured the same page twice, which
   looks convincing and proves nothing. See *Don't ship a fake comparison* below.
5. **Write a manifest JSON** and run the generator to emit the HTML.
6. **Preview** the page (open it in agent-browser, screenshot `--full`, Read it) and
   **deliver** it to the user (the `.html`, plus the preview PNG so it's viewable
   inline).

## Capturing with agent-browser

If an `agent-browser` skill is installed, load it first. Either way, run
`agent-browser skills get core` for the usage guide that matches the installed CLI.
Key commands: `open`, `set viewport`, `eval --stdin`, `screenshot`. Hard-won recipe:

- **Match the viewport for before & after.** Default to **1440px** wide for desktop
  designs: `agent-browser set viewport 1440 1000 2` (the trailing `2` = retina, crisper
  shots). Use the SAME width/zoom/scroll for both sources or the comparison is unfair.
- **Set the viewport BEFORE scrolling** — changing the viewport resets scroll position.
- **Sticky/fixed headers overlay your target.** Before scrolling to a region, hide them:
  ```js
  // agent-browser eval --stdin
  [...document.querySelectorAll('body *')].forEach(el=>{
    const p=getComputedStyle(el).position;
    if(p==='fixed'||p==='sticky') el.style.setProperty('display','none','important');
  });
  document.body.style.paddingTop='0';
  ```
  then scroll the element to the top: `el.scrollIntoView()` or
  `window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8)`.
- **Frame a region by cropping, not by shrinking the viewport.** Capture at a realistic
  viewport (430×760 for a phone, 1440×1000 for desktop), then crop afterwards with PIL
  using `getBoundingClientRect()`. Those rects are in CSS pixels: multiply them by
  `window.devicePixelRatio` (2 with the `set viewport ... 2` above) to get screenshot
  pixels. The rects already include any CSS `zoom`, so do not multiply by it again.
  A *short* viewport makes sticky/overlay UI — cookie banners, chat widgets, pinned
  footers — expand to fill the screen and bury the
  target. Worse, that overlay usually renders identically on both sources, so before &
  after come out byte-identical and the bug silently never appears.
- **Zoom in for fine detail** (small type, an icon, a footnote): set
  `document.body.style.zoom='2'`, but avoid an over-narrow viewport — it re-wraps text
  and ruins the crop. A 1100–1200px wide viewport at zoom 2 is a safe detail crop.
- **Use ABSOLUTE paths for `screenshot`** — agent-browser may resolve relative paths from
  a different cwd: `agent-browser screenshot /abs/path/B1.png`.
- **Basic-auth staging** (HTTP Basic Auth at the edge): pass an Authorization header,
  scoped to the origin, on `open`:
  ```bash
  AUTH=$(printf 'USER:PASS' | base64)
  agent-browser --headers "{\"Authorization\":\"Basic $AUTH\"}" open "https://staging.example.com/page.html"
  ```

### Don't ship a fake comparison

The failure mode of this skill is a page where **before and after are the same screenshot**.
It looks completely convincing and proves nothing. Two silent causes, both seen in the wild:

- **`open` failed and left the previous page loaded.** A transient auth/network blip makes
  `open` a no-op, so "before" captures whatever was already there — often the local, fixed
  build. The command still prints a success line.
- **An overlay buried the target on both sources** (see the cropping bullet above).

Guard with two cheap checks — do not skip them just because the images *look* right:

```bash
# 1. Assert page identity + old-vs-new code AT CAPTURE TIME, not just that `open` returned.
agent-browser eval '(() => {
  const el = document.querySelector(SEL);
  return location.hostname + " | " + getComputedStyle(el).maxWidth;  // pick a prop the fix changes
})()'
# BEFORE must report the staging host AND the OLD value; AFTER the local host AND the NEW value.

# 2. Checksum the pairs — identical hashes ⇒ you captured the same page twice.
md5sum *-BEFORE.png *-AFTER.png   # run inside the shots folder; macOS: shasum instead of md5sum
```

If a pair matches, stop and re-capture. Reading the images is necessary but not
sufficient: two shots of the same page look fine individually.

### Optional: prove the change objectively (not just visually)

A screenshot shows *a* difference; a computed-style/geometry probe proves it's *the*
difference. Run these with `agent-browser eval --stdin` and quote the numbers in the
manifest `desc`:

- **Font fallback** — does an element actually render in the intended webfont, or fall
  back? Measure the element's text width in its own stack vs a pure-fallback span of the
  same size/weight; equal widths ⇒ it's using the fallback:
  ```js
  const el=document.querySelector(SEL), cs=getComputedStyle(el);
  const w=(ff)=>{const s=document.createElement('span');s.style.cssText=`position:absolute;visibility:hidden;white-space:nowrap;font:${cs.fontWeight} ${cs.fontSize} ${ff}`;s.textContent=el.textContent.trim();document.body.appendChild(s);const x=s.getBoundingClientRect().width;s.remove();return x;};
  Math.abs(w(cs.fontFamily)-w('Arial'))<0.5  // true ⇒ rendering as Arial fallback
  ```
- **Line breaks** — does a token (e.g. "Wi-Fi") wrap across lines? Range it and count
  rects: `const r=document.createRange();r.setStart(node,i);r.setEnd(node,i+len);r.getClientRects().length>1`.
- **Spacing/padding** — read `getBoundingClientRect()` gaps between elements and compare
  to the Figma spec.

## Generating the page

Write a manifest next to your screenshots, then run the bundled generator. Image paths in
the manifest are resolved **relative to the manifest file**; `data:`/`http(s)` are passed
through. `desc` accepts inline HTML (`<b>`, `<code>`).

```json
{
  "title": "Sprint 12 — before & after",
  "subtitle": "Before = current staging · After = local prod build. Captured at 1440px.",
  "sections": [
    {
      "id": "WEB-123",
      "title": "Pricing — subheading font mismatch",
      "desc": "Heading fell back to heavy <b>Arial Bold</b> (no <code>@font-face</code> for Inter-SemiBold); switched to <b>Inter 600 18px</b> per the design.",
      "before": "B1-pricing-BEFORE.png",
      "after":  "A1-pricing-AFTER.png",
      "beforeLabel": "staging — Arial Bold",
      "afterLabel":  "Inter 600"
    }
  ]
}
```

```bash
node <skill_dir>/build-comparison.mjs <manifest.json> <out.html>
```

The generator inlines every image as base64, so `<out.html>` is a single portable file.
It exits with an error, and writes nothing, if a section lacks an image or if its before
and after images are byte-identical.
`title`, `id`, and the labels are escaped. `subtitle` and `desc` are inserted as raw
HTML, so only put trusted text there.

## Deliver

- Open it to sanity-check: `agent-browser open "file://<abs out.html>"`, then
  `agent-browser screenshot --full <preview.png>` and Read it.
- Give the user the `.html` (the page they asked for) **and** the full-page preview PNG
  (so it renders inline even where the HTML can't open). Use the host's file-sharing
  tool if it has one; otherwise report both absolute paths.

## Notes

- One section per *distinct* change keeps the page scannable; if several fixes live in one
  screenshot, you can reuse the same before/after pair across sections with different
  `desc` lines.
- Keep `desc` to one line. The screenshots carry the weight; the line says what changed
  and why.
- Put screenshots in a gitignored dir so a review artifact never lands in a commit.
