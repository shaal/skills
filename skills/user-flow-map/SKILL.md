---
name: user-flow-map
description: >-
  Map every user flow of a website or app into a swimlane user flow map (close
  to a service blueprint): a lane per access zone, a line colour per user type,
  and every page's actions listed on its card. Outputs an animated SVG that
  plays each flow in turn (works on GitHub and in an <img>), and an interactive
  HTML viewer for phones and small screens: pick a flow, switch between the full
  Map and a Focus view that keeps only the flow's boxes, step box by box, and
  pinch or drag to zoom. Works from a code repository (most accurate) or from a
  live website. Use when the user asks for a user flow diagram, all user flows or
  user journeys, every action and user type on a site, a site or screen flow
  map, a swimlane diagram or service blueprint of an app, an animated or
  interactive diagram of how people use a product, or one they can read on a phone.
---

# user-flow-map

Show **every page, every action on it, and every user type** of a product, from
one data file, in two outputs:

| Output | Best for | How it works |
| --- | --- | --- |
| `user-flows.svg` | GitHub, READMEs, docs, a quick look | Animated: each flow plays in turn. No script, so it runs in an `<img>` and on GitHub. Too wide to read on a phone. |
| `user-flows.html` | Phones, tablets, presenting, exploring | Interactive: flow picker, **Map** (every box in place) or **Focus** (only the flow's boxes, gaps removed), **All steps** or **Step by step**, swipe or arrow keys, pinch, drag or scroll to zoom, links to a step (`#flow=3&view=focus&steps=step&step=2`). |

Make both unless the user asks for one. GitHub shows an HTML file as source
code, so the SVG is the one to embed in a README; the HTML is for opening in a
browser or hosting.

**What it is called.** This is a **user flow map** drawn as a **swimlane
diagram**. With a System lane (payments, webhooks, cron, email), it is close to
a **service blueprint**. If the user asks, give that name and this comparison:

| Term | Shows | Difference |
| --- | --- | --- |
| User flow map (swimlane) | All user types, pages, actions | This skill |
| Site map | Pages only | No actions, no user types |
| Task flow | One task for one user | Too narrow |
| Customer journey map | Feelings and touchpoints over time | Not about screens |
| Service blueprint | User steps plus backstage systems | What the System lane adds |

Paths in this skill are relative to this folder. Run the scripts by absolute
path, for example `node <skill_dir>/scripts/render-flow-map.mjs ...`.

**Requirements:** Node.js 18+. For verification, Playwright with Chromium, or
any browser tool that can run JavaScript in a page. Install Playwright in a
scratch folder, never in the user's repo, so their `package.json` stays
unchanged: `mkdir -p /tmp/flow-map-verify && cd /tmp/flow-map-verify && npm i
playwright && npx playwright install chromium`.

## Workflow

1. **Scope.** Confirm the source: a repository (preferred, accurate) or a live
   URL (black box). Pick the output folder: in a repo, `docs/user-flows/`, with
   the data file `flows.mjs` next to `user-flows.svg` and `user-flows.html` so
   the user can regenerate them. Do not commit unless the user asks.
2. **Inventory.** Follow [references/inventory.md](references/inventory.md).
   With subagents, run the two explorer briefs there in parallel: customer
   flows, and admin + system actors. Trust the code over existing docs, and
   note where docs are stale.
3. **Model.** Decide lanes, actors, cards, edges, and flows (rules below).
4. **Lay out.** Copy [examples/acme-notes.flows.mjs](examples/acme-notes.flows.mjs)
   and edit it. The format, the layout helper, and the placement rules are in
   [references/data-format.md](references/data-format.md).
5. **Render.** The output type follows the file extension:
   `node <skill_dir>/scripts/render-flow-map.mjs flows.mjs user-flows.svg`, then
   the same command with `user-flows.html`. The renderer validates the data. For
   the HTML, it prints one line per flow saying whether the Focus layout routed
   cleanly.
6. **Verify.** From the scratch folder that has Playwright, run
   `node <skill_dir>/scripts/verify-flow-map.mjs /absolute/path/user-flows.svg --out <dir>`,
   then the same command with the `.html` file. The verifier finds Playwright in
   the current directory. For the HTML, it runs every flow in Map and Focus, and
   every step in step mode, at phone, sideways phone, tablet, and desktop sizes.
   Fix every `ERROR`, then Read the screenshots yourself (checklist below).
   Re-render and re-verify until both pass and the frames look right.
7. **Deliver** (see the end of this file).

## Modelling rules

- **Lanes are access zones, not user types.** Typical lanes: Public, Members
  (signed in), System, Admin. Each page then appears once. A lane per user type
  would duplicate shared pages such as the product list or checkout. Put System
  between the lanes that call it most, usually Members above and Admin below.
- **User types are actors, shown by line colour.** Each step names who performs
  it: visitor, member, invitee or gift recipient, admin, system. A flow can
  change actor mid-way, for example visitor → system → member.
- **Every action goes on a card, not on an edge.** Cards list the page's
  actions as bullets: at most 5, about 28 characters each. Draw edges only for
  steps of the named flows, about 40–50 in total. Otherwise the map turns to
  spaghetti.
- **Flows:** 6–12 flows, each with at most about 11 steps. System steps such as
  webhooks, AI calls, emails and crons belong inside the flows they serve. Do
  not make separate system flows.
- **Draw where the code goes, not what the button says.** Check redirects,
  dropped `callbackUrl` values, automatic navigation after success, and buttons
  that do the same as another button.
- **Leave out unreachable code.** Actions with no UI, jobs with no scheduler,
  and email templates nothing sends are not user flows. List them in your
  reply instead.

## Verification checklist (Read each flow screenshot)

- The verifier passes with 0 errors in the system font and in Inter. The
  `wide` font warnings are a stress test, so fix them only if they are cheap.
- No highlighted line passes through an unrelated card. If one does, route it
  through a free channel with `via`.
- Two-way pairs (A→B and B→A) do not cross. Each route keeps the same side on
  every leg (see data-format.md).
- Each label sits on its own line, not on a parallel neighbour.
- The caption is at most 2 lines. The renderer warns when it is longer.
- Two screenshots that are identical mean the scrub did not land. The verifier
  checks this, so do not trust a run that skipped it.

For the HTML viewer, also check the phone screenshots: in Focus on an upright
phone, each step shows two boxes and the label between them, with readable
text. The verifier already fails on text under 12px, a box off screen,
overlapping labels, a page that scrolls, and rotation that does not switch the
Focus layout.

Without Playwright, load the SVG in your browser tool, evaluate
`scripts/checks.js`, call `flowMapChecks(svgElement)`, then pause the SVG and
call `setCurrentTime(t)` with each `done` time from its `data-flow-times`
attribute, taking one screenshot per flow. For the HTML, open it, evaluate
`scripts/viewer-checks.js`, and call `flowViewerChecks()` at each screen size.

## How the HTML viewer lays out Focus

You do not lay out Focus by hand; the renderer derives it from the Map data.

- **Upright phone (narrow and tall): one column in step order.** Each step is a
  short vertical arrow with its label in the gap. A box the flow returns to
  appears again, marked "again", so arrows never jump backwards. Each box shows
  its lane name above it.
- **Wider screens: a compact swimlane.** It keeps the same lanes and
  left-to-right order, and drops the columns and rows the flow does not use. A
  gate sits between its neighbouring columns. Edges are routed through free
  channels, and labels are placed so they do not cover cards or each other.
- **Step by step** zooms to the step's two boxes and label. When those do not
  fit at a readable size, it zooms to the target box only. Card text stays at
  12px or larger on screen.
- `labelAt` and `via` shape only the Map layout. If the renderer reports a
  Focus problem for a flow, shorten that flow's labels or split the flow.

## Gotchas

- **A CSS class beats a `fill` attribute.** The renderer sets text colour with
  `style`. Keep it that way if you edit it.
- **Measure in the viewer's font.** Inter is usually not installed, so Safari
  and Chrome fall back to SF Pro or Segoe UI. The verifier checks these fonts.
- **Side-by-side cards have a 104px gap.** The renderer wraps labels on those
  edges to fit. If a label still covers a card, set `labelAt`.
- **Labels in the outer channels clip at the canvas edge.** Move them inward
  with `labelAt`.
- **GitHub shows the SVG shrunk to the page width.** It still animates there,
  but the text is too small to read. Recommend opening the file in a browser.
- **The output has no script.** It animates as a file, inside an `<img>`, and
  on GitHub. With `prefers-reduced-motion`, it shows the static full map.

## Deliver

Tell the user, in this order:

1. How to view it:
   - **SVG:** run `open <path>/user-flows.svg` (or the platform's equivalent).
     It opens at full size; zoom out to fit it to the window.
   - **HTML:** run `open <path>/user-flows.html` on a computer.
   - **HTML on a phone:** send the file with AirDrop or a file share, or host it.
     Ask before you start a local network server or publish anything, because
     the map can reveal internal routes and admin pages.
2. The name: a user flow map drawn as a swimlane diagram, close to a service
   blueprint if it has a System lane.
3. What it covers: the number of screens and services, the lanes, the user
   types, and the flow list.
4. The file paths and the regenerate command, and that nothing is committed.
5. As separate follow-ups, not mixed into the summary: findings from the
   inventory, such as bugs, copy that contradicts the code, unreachable
   features, and stale docs.

If the host can show HTML inline, show the SVG twice: once fitted to the width
so it animates as a whole, and once at full size in a scrolling box. For the
HTML viewer, show the phone screenshots from the verifier.
