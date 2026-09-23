---
name: photoreal-demos
description: "Build photoreal, interactive 3D demos for the web with three.js (real time), Blender Cycles (path traced, then relit or scrubbed live in a WebGL viewer), or a hybrid (Blender bakes lighting, textures, glTF, panoramas or simulations that three.js renders live). Use when the user asks for a photorealistic or 'Unreal-like' interactive scene, a WebGL or three.js showcase, a relightable product shot, an archviz walkthrough, a Blender render people can interact with, or a batch of such demos."
---

# Photoreal demos

Build one self-contained web page that looks like a photograph and responds to the viewer: they walk, relight, change the weather, scrub time, or refocus. Verify it with real GPU screenshots, then publish it.

## Pick the technique

| Technique | Choose it when | Interaction comes from |
| --- | --- | --- |
| **three.js** | The scene must move freely: walking, weather, physics, sculpting, particles | Live rendering, 60 fps |
| **Blender** | Light transport is the star: glass, caustics, subsurface, soft interiors, product shots | Pre-rendered passes remixed in a WebGL viewer: relight by light group, scrub a sun path or simulation, orbit through views, refocus from depth |
| **Hybrid** | You need free movement *and* path-traced light | Blender bakes lightmaps, textures, glTF, HDRIs, panoramas, impostors or simulations; three.js renders them live |

If the user names a technique, use it. Otherwise pick by the table and say which one you chose and why in one line.

## Workflow

Paths in this skill are relative to the skill's own folder. Run its scripts by absolute path (`python3 <skill_dir>/scripts/shot.py ...`). Copy the template, the viewer or an example into the user's project before you edit it. Never edit the installed skill.

1. **Check the machine.** Follow [references/setup.md](references/setup.md) once per machine: GPU in Chrome, Python packages, Blender 5.2+ if needed, a free local port.
2. **Anchor the concept in the real world.** Pick a real place, date, time, material or unit system (47° N on 21 June, Beaufort 9, 1850 K candlelight, 7.6 mm/h rain). Real numbers drive the lighting and give the UI honest readouts.
3. **Build.** Follow the reference for your technique:
   - three.js: [references/threejs.md](references/threejs.md). Study [examples/tallgrass-meadow.html](examples/tallgrass-meadow.html) and [examples/rain-alley.html](examples/rain-alley.html) before you start.
   - Blender: [references/blender.md](references/blender.md), [scripts/blender_relight_template.py](scripts/blender_relight_template.py), [scripts/encode_hdr_atlas.py](scripts/encode_hdr_atlas.py), [assets/relight-viewer.html](assets/relight-viewer.html).
   - Hybrid: [references/hybrid.md](references/hybrid.md) plus both of the above.
4. **Look development loop.** Screenshot with [scripts/shot.py](scripts/shot.py), critique it like a VFX supervisor, fix, repeat. Do at least three passes and check two or more camera angles. [references/quality-bar.md](references/quality-bar.md) lists the failures that come up most and their fixes. Check it before every pass.
5. **Verify.**
   - No `[pageerror]` in the console.
   - About 60 fps at 1600×900 on a discrete or Apple GPU.
   - A phone check with `shot.py --mobile --w 400 --h 860`, which exercises the touch path and reports horizontal overflow.
   - The `renderer` line from `shot.py` names the GPU. If it says SwiftShader or llvmpipe (for example in a cloud sandbox), keep taking screenshots with a longer `--wait`, skip the fps gate, and report "fps unverified (no GPU)" as a known weakness.
6. **Publish.** Follow [references/publishing.md](references/publishing.md). If the agent has an artifact publishing tool (such as Claude Code's `Artifact` tool), publish there. Otherwise deliver the folder and serve it locally.
7. **Report honestly.** Give the link, one sentence on what the viewer sees and can do, how you verified it, and any known weaknesses.

## Quality bar

- **Photoreal first.** HDR half-float render targets, linear lighting, ACES (Unreal's default) or AgX tone mapping, exposure that is tuned or automatic, bloom only on true highlights, fog or aerial perspective, contact shadows or AO, subtle grain and vignette. Use real scale: meters, Kelvin, EV, lux.
- **Interactive.** At least one meaningful control beyond orbiting the camera. Drag and touch work; keyboard where it helps.
- **Performant.** Adaptive resolution, and a lighter path for touch devices (`matchMedia('(pointer: coarse)')`).
- **Its own identity.** A palette and type pairing chosen for the subject. Avoid default-looking UI (Inter, purple gradients, identical glass cards).

## Page rules

- One `index.html` plus an `assets/` folder. No build step.
- Start the page with `<meta charset="utf-8">` and `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`. Without the viewport tag, phones lay the page out 980 px wide.
- three.js through an import map pinned to one version, from `cdn.jsdelivr.net/npm/three@<version>/`. The examples use `0.170.0`.
- No runtime network access besides the pinned CDN and Google Fonts. Load models, textures and data by relative URL, or generate them in code.
- Expose a debug handle (for example `window.__demo = {...}`; the examples use `__meadow`, `__alley` and `__relight`) so `shot.py --js` can move the camera and change state during verification.

## Tools in this skill

| File | Use |
| --- | --- |
| [scripts/shot.py](scripts/shot.py) | Real-Chrome GPU screenshots with JS steps, an fps reading and console capture (macOS, Windows, Linux) |
| [scripts/blender_relight_template.py](scripts/blender_relight_template.py) | Blender 5.2+ procedural Cycles scene: one OIDN-denoised EXR per light group per view; auto-selects Metal, OptiX, CUDA, HIP or oneAPI |
| [scripts/encode_hdr_atlas.py](scripts/encode_hdr_atlas.py) | EXR light groups → HDR-preserving WebP atlas per view + `manifest.json` |
| [scripts/preview_exr.py](scripts/preview_exr.py) | Tone-mapped PNG of a pass mix, to judge a render before encoding |
| [assets/relight-viewer.html](assets/relight-viewer.html) | WebGL2 viewer: per-light level and Kelvin, looks, solo, flicker, drag through views, bloom, ACES |
| [examples/](examples/README.md) | Two complete three.js demos: a sunlit meadow and a rainy neon alley |

## Many demos

For a batch (for example "make 20 of these"), follow [references/batch.md](references/batch.md). It covers the concept list, a shared brief, running three builders at a time, keeping the machine awake, and checking the first result before the rest.
