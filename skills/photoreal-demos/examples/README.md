# Example demos

Two complete, single-file three.js demos built with this skill. Serve the skill folder (the parent of `examples/`) over HTTP and open either file. Everything is procedural, so there are no assets.

| File | Scene | Techniques worth copying |
| --- | --- | --- |
| [tallgrass-meadow.html](tallgrass-meadow.html) | An alpine meadow at 47° N on 21 June. Drag the clock from afternoon through golden hour to a starry night with fireflies. | Sky LUT with a CPU mirror (`SKYLUT_FRAG`, `transJS`, `scatterJS`), real solar position (`solar`), horizon occlusion, camera-wrapped instanced grass (`GRASS_VERT`), wind and a trample render target, leaf-card oaks (`makeCardOak`), fitted sun shadow map (`updateTreeShadow`), terrain shadow raymarch (`SHADOW_FRAG`), god rays, spawn search (`findSpawn`), adaptive resolution, synthesized wind and crickets |
| [rain-alley.html](rain-alley.html) | A Tokyo back alley at 1 AM in the rain. Walk it and change rain, haze and sign brightness. | Nearest-40 light array shading (`LIGHT_GLSL`), a procedural facade shader, a canvas sign atlas with Japanese fonts (`buildAtlas`), mirrored planar reflections with roughness blur (`updateReflection`, `GROUND_FRAG`), puddle ripples, analytic volumetric glow (`SCATTER_FRAG`), lit rain streaks, lens drops |

Both expose a debug handle (`window.__meadow`, `window.__alley`) for scripted screenshots, for example:

```sh
python3 <skill_dir>/scripts/shot.py http://127.0.0.1:<port>/examples/tallgrass-meadow.html meadow.png --wait 10000 \
  --js "window.__meadow.setTime(1240)" --wait-after 2000
```

Use them as references for technique, not as templates to restyle. Every new demo needs its own subject, composition and UI identity.
