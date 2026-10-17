# Data format and layout rules

`render-flow-map.mjs` imports one ES module. Start from
[../examples/acme-notes.flows.mjs](../examples/acme-notes.flows.mjs).

## Exports

| Export | Required | Shape |
| --- | --- | --- |
| `META` | no | `{ title, subtitle, footer }` |
| `LAYOUT` | no | Overrides for the grid (below) |
| `TIMING` | no | `{ overview: 5, lead: 0.6, step: 0.7, hold: 2.6, fade: 0.35 }`, in seconds |
| `LANES` | yes | Array, top to bottom: `{ id, name, color, tint, rows, notes: [..] }` |
| `ACTORS` | yes | `{ id: { label, color } }`, one per user type plus `system` |
| `NODES` | yes | `{ id: node }` (below) |
| `EDGES` | yes | `{ id: edge }`, or a function `(L) => ({ id: edge })` that uses the layout helper |
| `FLOWS` | yes | Array: `{ title, who, desc, steps: [[edgeId, actorId, label, opts?], ..] }` |

Keep `notes` to 3 short lines (the lane label column is 160px wide). Keep `desc`
to 2 lines (about 80–140 characters, depending on the map width). The renderer
warns when a description is longer.

### Node

| Field | Meaning |
| --- | --- |
| `lane`, `row`, `col` | Grid slot. `col` may be fractional, for example `1.5` puts a gate between columns 1 and 2. Two nodes cannot share a slot. |
| `kind` | `page` (default), `modal` (dashed), `service` (no UI, lane-coloured border), `gate` (diamond, for sign-in or a decision), `end` (dark pill, for an end state such as "Signed out") |
| `route` | Top line in monospace: the URL, or the service name for `service`. Not used by `gate` or `end`. |
| `name` | Bold title |
| `actions` | Bullets: every action on the page, at most 5 of about 28 characters. `gate` shows 2 short lines, `end` shows 1. |
| `dy` | Optional vertical nudge in pixels |

### Edge

| Field | Meaning |
| --- | --- |
| `from`, `to` | Node ids |
| `fromSide`, `toSide` | `T`, `B`, `L`, `R`. The default is side to side within a row, and bottom to top between rows. Gates attach at their tips. |
| `fromOff`, `toOff` | Slide the anchor along the side, in pixels. Use ±30–50 to separate edges that share a side. |
| `via` | `[[x, y], ..]`. Turns the edge into a rounded orthogonal route through these points. Make consecutive points share x or y. |
| `labelAt` | `[x, y]` label centre. The default is the middle of a curve, or the middle of the longest straight run of a `via` route. |
| `alt` | `true` draws it dashed, for failure branches. Its label shows "!" instead of a step number, so the numbers count only the main path. |

A step's optional 4th element, `{ labelAt: [x, y] }`, overrides the label
position for that flow only.

Every edge should belong to at least one flow. The renderer warns about edges
that no flow uses, because they show only as gray lines and confuse the tour.

## Layout helper `L` (passed to `EDGES(L)`)

| Member | Value |
| --- | --- |
| `L.col(c)`, `L.mid(c)` | Left x and centre x of column `c` |
| `L.gapX(c)` | x of the free vertical channel between columns `c` and `c + 1` |
| `L.left` | x of the channel left of column 0 |
| `L.right(track)` | x of the channels right of the last column; tracks are 26px apart |
| `L.below(lane, row, track)` | y of the free horizontal channel under that row: between rows, or between lanes. Tracks are 12px apart and may be negative. |
| `L.rowTop`, `L.rowBottom`, `L.laneTop`, `L.laneBottom` | Raw y values |
| `L.box(id)`, `L.cx(id)`, `L.cy(id)`, `L.anchor(id, side, off)` | Node geometry |
| `L.WIDTH`, `L.HEIGHT` | Canvas size |

## Grid defaults (`LAYOUT`)

`X0: 220` (first column x), `P: 300` (column pitch), `W: 196` (card width, so
the gap between columns is 104px), `HEADER: 192`, `ROW_GAP: 48`,
`LANE_PAD_TOP: 18`, `LANE_PAD_BOTTOM: 40`, `LANE_GAP: 8`, `RIGHT: 90` (room for
right channels), `MIN_WIDTH: 1760` (room for the header legend). The canvas
width follows the highest column. Nine columns give about 2900px.

## Placement rules

1. **Order columns like the funnel, left to right:** entry, sign-in, create,
   shop, pay, after purchase, account. Keep related pages in the same column
   across lanes, for example a page directly above the service it calls.
2. **Keep a column empty in every row that a long vertical edge must cross.**
   Before you place a node, check which edges pass through that slot.
3. **Route long edges through channels,** never through cards. Use
   `L.below(...)` for horizontal runs, `L.gapX(...)` for vertical runs, and
   `L.left` or `L.right(...)` around the outside.
4. **Give parallel runs separate tracks,** 12px apart. When two routes run in
   opposite directions between the same cards (A→B and B→A), keep each route
   on the same side for every leg. If the outbound route takes the right
   vertical track, it also takes the upper horizontal track. Mixing sides
   makes the two routes cross.
5. **Put a sign-in gate between the sign-up and sign-in cards,** in the row
   below them (`col: 1.5`). The redirect after sign-in then leaves the gate's
   bottom tip.
6. **Put end states next to their trigger,** for example "Signed out" beside
   Settings.
7. **Use at most about 9 columns and 2 rows per lane.** For bigger products,
   make one map per area or per user type.

## Labels

- Labels show only while their flow plays. Each label sits on its own line,
  numbered in step order, and coloured by the step's actor.
- Side-by-side edges wrap their label to fit the 104px column gap.
- Edges that share a corridor, run in parallel, or meet at a card need
  `labelAt` at different heights.
- The verifier reports labels that overlap each other, cover a lit card by
  more than 6px, overflow their pill, or leave the canvas.
