# Quality bar and common failures

## Before you publish

- [ ] The first frame is a composed, flattering shot. Nothing is waiting behind a click to look good.
- [ ] Exposure sits right in every state the controls reach: noon and night, calm and storm, every look preset.
- [ ] Highlights bloom; midtones do not. Text on emissive signs stays legible.
- [ ] Distant objects fade into the actual horizon color (aerial perspective), with no seam between fog and sky.
- [ ] Contact shadows or AO ground every object. Nothing floats.
- [ ] The one hero interaction is obvious from the UI and works with mouse, touch and keyboard.
- [ ] The UI shows real units (°, K, EV, lux, mm/h, Beaufort, m/s, local time).
- [ ] You screenshot at least two camera angles and two control states, plus a phone view with `shot.py --mobile --w 400 --h 860` (no horizontal overflow).
- [ ] No `[pageerror]` in the console. fps is measured and adaptive resolution is in place.

## Failures seen in practice

| Symptom | Cause | Fix |
| --- | --- | --- |
| Whole frame washes out white or grey | Additive glow or in-scatter without phase normalization | Multiply point-light in-scatter by `σ/(4π)`, clamp near-ray distance, cap the result |
| Scene far too dark at start | Camera spawned in a hill's or building's shadow facing the light | Search spawn points for an open view toward the light |
| Exposure wildly off between states | A fixed exposure constant | Meter ambient plus key light, compress (`k / lum^0.8`), clamp, ease over about 0.5 s |
| Trees look like broccoli or blobs | Displaced spheres as crowns | Branch skeleton plus alpha-to-coverage leaf cards with spherical normals; keep blobs for distant stands only |
| Grass looks like ribbons | Blades too wide and too few | 1–2.5 cm blades, about 250 per m² near the camera, clumping, darker roots |
| Square glow sprites | Gaussian tail not zero at the sprite edge while night exposure is high | Subtract the edge value and `discard` outside the radius |
| Particles read as daytime stars | Floating dust too bright away from the sun | Make brightness mostly forward scattering (`pow(dot(V, L), 7)`), with a tiny base |
| Emissive panels look like flat paper | Uniform emission | Add structure (frames, shelves, lamp falloff, silhouettes) and lower the intensity |
| Side faces glow | Emissive shading applied to every face of a box | Detect the front face by normal and treat the other faces as body material |
| Lens drops look like grey discs | Drops tinted or shaded | Offset the UV to show an inverted, squeezed view; only a slightly darker rim |
| A very bright point turns into a box of bloom | `UnrealBloomPass` on a near-infinite highlight | Clamp the bloom input, or use a 13-tap downsample with tent upsample |
| Sprites or rain vanish at some angles | Hand-built basis with determinant −1 flips winding | Fix the basis, or use `DoubleSide` |
| Color blocks or green halos in pre-rendered highlights | 8-bit HDR curve scale too low; WebP 4:2:0 chroma | Default encoder scale (`p99.9/6`, clamped to 1–4x the mean) or `--lossless` |
| Banding in dim areas after raising a light | Scale too high because a tiny, very bright source dominated | Keep the scale at or below 4x the mean (the encoder default) |
| Flames turn cyan | Flame emission too white under warm white balance | Tint flames about 1850 K and saturated |
| Sun blocked through a window | A zero-thickness glass plane traps light by total internal reflection | Give the pane thickness (Solidify), or use the Principled BSDF's `Thin Wall` input |
| Noisy bakes | Adaptive sampling on while baking | Turn it off for bakes |
| Mirrored text | UV orientation differs per box face | Screenshot signs from both sides; flip `u` on the mirrored face |
| `Â°` or garbled characters | Page served without a charset | Start the page with `<meta charset="utf-8">` |
| fps looks perfect but the GPU is idle | WebGL fell back to SwiftShader | Check `shot.py`'s `renderer` line; fix the GPU flags or drivers |
| Server returns 404 for the page | Another tool already owns the port | Check the port first (`lsof`, `ss` or `netstat`; see setup.md) and pick a free one |

## How to critique a screenshot

Ask these, in order:
1. Would a photographer believe this frame? Look at light direction, shadow softness, color temperature and horizon.
2. What is the eye drawn to, and is it the subject?
3. Where does it look "CG"? Common spots: uniform albedo, perfect edges, missing contact shadows, clipped color, flat emissives, regular repetition.

Fix the biggest problem first, then screenshot again.
