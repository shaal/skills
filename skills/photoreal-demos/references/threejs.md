# three.js recipes

Patterns that made the example demos read as photographs. Search the examples for the named functions and shader strings to see each one in full context:

- [examples/tallgrass-meadow.html](../examples/tallgrass-meadow.html): open landscape, physically based sky, ~770k instanced grass blades, trees with a sun shadow map, god rays, time of day to night.
- [examples/rain-alley.html](../examples/rain-alley.html): night city, 40-light shading, planar wet-road reflections, analytic volumetric glow, rain, lens drops.

## Page skeleton

```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Short Distinct Name</title>
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
} }
</script>
<script type="module">
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
</script>
```

Show a loading veil with honest progress messages while procedural content builds, and yield to the browser between heavy steps (`await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)))`).

## HDR pipeline

Render the scene yourself into a multisampled half-float target, then run your own passes. This avoids `EffectComposer` buffer-swap surprises and gives you the depth texture.

```js
renderer.setPixelRatio(1);                     // you manage resolution (adaptive scale)
const sceneRT = new THREE.WebGLRenderTarget(W, H, {
  type: THREE.HalfFloatType, samples: isTouch ? 2 : 4,
  depthTexture: new THREE.DepthTexture(W, H, THREE.FloatType),
});
const hdrRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false });
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.3, 0.6, 1.6);   // strength, radius, threshold
const fsq = new FullScreenQuad(null);

// per frame
renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(scene, camera);
// optional passes that read sceneRT.texture / sceneRT.depthTexture (god rays, fog glow) go here
compositeMat.uniforms.uExposure.value = exposure;               // scene + extras, times exposure
renderer.setRenderTarget(hdrRT); fsq.material = compositeMat; fsq.render(renderer);
bloom.render(renderer, null, hdrRT, dt, false);                  // adds bloom onto hdrRT in place
renderer.setRenderTarget(null); fsq.material = finalMat; fsq.render(renderer);
```

On resize (and whenever adaptive resolution changes the scale), call `renderer.setSize(W, H, false)`, `setSize` on every render target, and `bloom.setSize(W, H)`, and update the camera aspect.

The final pass does tone mapping and the camera look, in this order: chromatic aberration (tiny, at the edges), ACES or AgX (`#include <tonemapping_pars_fragment>` gives `ACESFilmicToneMapping()` and `AgXToneMapping()`; add a `toneMappingExposure: {value: 1}` uniform), vignette, sRGB encode, then grain added after encoding so it stays even across tones.

Built-in three.js materials write linear HDR when rendering into a target, so custom `ShaderMaterial`s and built-ins can share the pipeline.

## Shared uniforms

Create one object of `{ value }` uniforms (time, sun direction, sun color, ambient colors, fog, wind) and spread it into every `ShaderMaterial`: `uniforms: { ...U, uLocal: { value } }`. `ShaderMaterial` keeps the object references, so one update per frame reaches every material.

Keep common GLSL (hash, value noise, fbm, fog, sky lookup, shadow lookup) in one string and prepend it to each shader.

## Light that behaves physically

- **Sun color and sky from one model.** Integrate Rayleigh + Mie + ozone single scattering. On the GPU, render a small sky-view LUT (256×128, elevation mapped with `v = sqrt(el / (π/2))` for horizon detail) whenever the sun moves. Mirror the same integral in JS to get sun transmittance (direct light color) and to integrate hemispherical sky irradiance for ambient light. The sky, fog, ambient and sun then always agree. See `SKYLUT_FRAG`, `transJS` and `scatterJS` in the meadow.
- **Real sun position.** Compute elevation and azimuth from latitude, declination and solar time. Real clock times on the UI are cheap and convincing.
- **Horizon occlusion.** Precompute the terrain horizon angle per azimuth so the sun disappears behind real mountains, not the geometric horizon.
- **Exposure.** Meter the scene from ambient and sun luminance, compress it (`k / lum^0.8`), clamp it, and ease toward it over about 0.5 s. Let night stay dark: blend toward a blue-shifted, desaturated image when luminance is low (a Purkinje shift).
- **Fog and aerial perspective.** Height-exponential fog. The in-scatter color is the sky LUT sampled at the view direction, clamped just above the horizon, so distant hills melt into the actual horizon color.
- **Night.** A moon as the key light below about −2° sun elevation, stars and a Milky Way band in the sky shader, emissive fireflies or lamps that feed bloom.

## Vegetation and ground

- **Grass.** Instanced blades whose tile of positions wraps around the camera (`world = local + tile * floor((cam - local) / tile + 0.5)`) so the field is infinite with a fixed instance count. Use two layers (dense near, sparse and wide far) with radial cross-fades. Put per-blade attributes on the CPU (position, yaw, height, width, clump lean) and height, wind and color on the GPU. Bend blades along a constant-curvature arc, which preserves length.
- **Shading grass.** Diffuse on the lit side, transmission through the back (`max(-N·L, 0)` with a yellow-green tint), forward scattering when looking toward the sun (`pow(max(dot(-V, L), 0), 5)`), a narrow specular sheen, and ambient occlusion from root to tip. Backlit grass at golden hour is the money shot.
- **Wind.** A scrolling noise field gives traveling gusts, plus a small per-blade flutter. Use the same function for audio (wind volume follows the gust at the camera).
- **Trample and brush.** A ping-pong render target in world-wrapped (toroidal) coordinates stores push vectors that decay over time. Stamp it where the cursor ray hits the ground and under the walking camera.
- **Trees.** Blobs look like broccoli. Build a branch skeleton recursively, then put alpha-tested leaf cards (a procedural canvas texture of leaves) at the twig ends. Give the cards spherical normals from the crown center, `alphaToCoverage: true` with MSAA, translucency, and AO from crown depth. Use cheap displaced-icosphere blobs only for distant forest stands.
- **Terrain.** One CPU height function drives the terrain mesh, a half-float heightmap texture (for grass roots and shaders) and camera ground-following, so all three agree. A polar mesh (fine rings near the play area, geometric rings out to far mountains) covers kilometers cheaply.

## Shadows

- **Terrain shadows.** Raymarch the heightmap toward the sun in a full-screen pass into a 512² texture. Redo it only when the sun moves.
- **Object shadows.** Fit an orthographic camera tightly around the area near the viewer, in light space. Render the casters with an `overrideMaterial` depth shader (with alpha test for leaves), and sample with 9-tap PCF in terrain and grass shaders. Re-render when the camera moves 35 m or the sun moves.
- **Cloud shadows.** Project the ground point along the sun direction up to the cloud layer, and sample the same cloud density the sky shader draws.

## Night city lighting

- **Many lights.** Keep a list of light sources: signs, lanterns, windows, lamps. Each frame, sort by distance and upload the nearest 40 as `vec4` arrays (position + radius, color × intensity). Shade with GGX + Lambert and a smooth radius window. Put flicker on the CPU.
- **Wet roads.** Render the scene mirrored below the ground plane into a half-float target with mipmaps (see `updateReflection` in the alley). Sample it with a texture matrix, perturbed by a procedural rain-ripple normal, blurred by roughness with `textureLod`, and smeared vertically with several taps. Mix it with Fresnel and a puddle mask.
- **Glow in haze.** For each light, the in-scattered radiance along a view ray has a closed form: `I · (atan((s − b)/h) − atan(−b/h)) / h`, where `b` is the projection of the light onto the ray, `h` the ray-to-light distance and `s` the ray length from the depth buffer. Multiply by `σ / (4π)`. **Forgetting the 1/(4π) whites out the frame.** Clamp `h` to about 0.2 m.
- **Rain.** Instanced camera-facing streaks that wrap around the camera, lit per vertex by the same light array, with additive blending. Add lens drops in the final pass: a few cells hold a drop that shows an inverted, squeezed view (offset the UV by `−d / scale`) with a darker rim. Never tint the drops grey.
- **Signs.** Draw text into one canvas atlas with `document.fonts.load()` awaited first. Map atlas cells onto box faces. For Japanese text, Google's Dela Gothic One and Yuji Syuku work well. Keep emissive values moderate so text stays legible after bloom.

## Camera and controls

- Drag to look, WASD to walk (Shift to run), scroll for height or zoom, and a hold-to-walk button on touch screens. Ground-follow with smoothing and a small head bob.
- Offer an autopilot ("Drift", "Stroll") that stops when the user takes over.
- Start the camera on a composed, flattering view. Search spawn candidates programmatically for an open view toward the light rather than hardcoding one.

## Performance

- **Adaptive resolution.** Average the frame time each second. If it is over 1/40 s, lower the render scale by 0.1 (floor about 0.55). If it is under 1/75 s, raise it by 0.05. Wait two seconds between changes.
- Cap `devicePixelRatio` near 1.35 on desktop and 1.5–2 on touch devices. On touch devices, use fewer instances, lower MSAA, and smaller shadow maps.
- Use `frustumCulled = false` on GPU-positioned instanced meshes, since their bounding spheres are wrong.
- Merge static geometry into a few meshes with a `kind` attribute that switches shading branches.

## Sound

Only start audio after a click. Wind from filtered brown noise that follows the gusts, crickets from an AM-modulated oscillator at night, rain from band-passed noise plus random drip blips. A small synthesized soundscape adds more presence than any visual tweak.
