# Blender (Cycles) demos

Path trace the hard light offline, then let the viewer play with it live. Start from a copy of [../scripts/blender_relight_template.py](../scripts/blender_relight_template.py) in your project: a complete still life (whisky glass, decanter, candle, lemons, window sun) that renders one denoised EXR per light group per camera view. It is tested on Blender 5.2 and needs the 5.0+ API. Run it with `"$BLENDER" -b --factory-startup --python <copy>.py -- <out_dir> <samples> <views>` (see [setup.md](setup.md) for `BLENDER`).

## Pipeline

1. **Build the scene in Python.** Use bmesh, modifiers, shader nodes and geometry nodes. Do not download assets. The template's helpers cover most needs: `lathe()` revolves a profile (glassware, vases, candle holders), `box()` makes bevelled boxes, `sphere()` makes spheres, and `material()` sets up a Principled BSDF.
2. **Test cheaply.** Render one view at 16–64 samples and judge it with `scripts/preview_exr.py`. Fix composition, materials and light balance here, not after a batch.
3. **Render the batch** within the budget below.
4. **Encode** with `scripts/encode_hdr_atlas.py <render_dir> <page>/assets`.
5. **View** with a copy of [../assets/relight-viewer.html](../assets/relight-viewer.html) as your `index.html`. Edit its `CONFIG`, then restyle it for the subject. The viewer shows up to 8 light groups. Keep each atlas at or below 4096 px on its longest side (`--max-width`) so phones can load it.
6. **Delete the EXRs** once the atlases look right.

## Interaction modes

Light is additive and RGB transport is separable per channel. A pre-render can therefore be remixed exactly, not approximately.

| Interaction | What to render | Viewer does |
| --- | --- | --- |
| Relight | One light group per light (and the world) | Weight x Kelvin color per group, sum, tone map |
| Orbit or turntable | The same groups from N camera positions (15–40 views) | Drag cross-fades neighboring views |
| Time of day | A sun position per view (a real solar path; 20–40 steps) | Drag scrubs time; keep lamps as separate groups |
| Refocus | An all-in-focus render plus a depth or distance pass | Gather blur with a circle of confusion from depth at the clicked point |
| Simulation scrub | Baked cloth, rigid body or fluid frames | Drag scrubs frames |
| Material recolor | AOV masks (Cycles AOV output) or per-channel absorption renders | Tint inside the mask, or interpolate absorption per channel |
| Glass tint | A thickness AOV (a volume that emits a fixed amount per meter) | Beer–Lambert `exp(-σ·d)` per channel |

Store a depth pass separately, not in the HDR atlas: encode log depth losslessly into 16 bits across two 8-bit channels of a PNG.

## Light groups and passes

```python
vl = scene.view_layers[0]
for g in ("sun", "sky", "candle", "pendant"):
    vl.lightgroups.add(name=g)
vl.cycles.denoising_store_passes = True     # Denoising Albedo / Normal for per-group OIDN
light_object.lightgroup = "sun"             # lights and emissive meshes
scene.world.lightgroup = "sky"              # the environment
```

Each group appears on the Render Layers node as `Combined_<group>`. Cycles denoises only the main Combined pass, so denoise every group in the compositor (below).

Render every light at a neutral white and a sensible power. The viewer applies color temperature, so a light rendered white can become any Kelvin.

## Blender 5.x API notes

Older examples online use the 4.x API. In Blender 5.0 and later:

- **Compositor:** `scene.node_tree` is gone. Create a group and assign it:
  ```python
  tree = bpy.data.node_groups.new("Compositor", "CompositorNodeTree")
  scene.compositing_node_group = tree
  ```
- **Output:** `CompositorNodeComposite` is gone. Add a `NodeGroupOutput`, create its socket with `tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")`, and link the image to `inputs[0]`.
- **Denoise:** the options are input sockets: `dn.inputs["Prefilter"].default_value = "Accurate"`, `dn.inputs["HDR"].default_value = True`, `dn.inputs["Quality"].default_value = "High"`.
- **File Output:** set `fo.format.media_type = "IMAGE"` before `fo.format.file_format = "OPEN_EXR"` (the default is multilayer EXR). Use `fo.directory` and `fo.file_name = ""`. Add one input per pass with `fo.file_output_items.new("RGBA", name)`, then link to `fo.inputs[name]`. Files land as `<directory>/<name>.exr`, with no frame suffix.
- **Sky texture:** `sky_type = "SINGLE_SCATTERING"` (formerly `"NISHITA"`), or the new `"MULTIPLE_SCATTERING"`.
- **Caustics flags:** `obj.cycles.is_caustics_caster`, `obj.cycles.is_caustics_receiver` and `light.cycles.is_caustics_light`.
- Light groups, the `Combined_<group>` pass names, Principled BSDF input names and `bpy.ops.export_scene.gltf` are unchanged.

## Render budget

- Stay within about 15 minutes of Cycles time per demo. If other jobs share the GPU, give each a proportional share.
- Use 1280×720 to 1440×810 (up to 4096×2048 for panoramas) and 128–256 samples with adaptive sampling (threshold about 0.006). Denoise per group with OIDN.
- For clean glass: `transmission_bounces` and `max_bounces` at 16–24, `caustics_refractive = True`, `blur_glossy` about 0.2, `sample_clamp_indirect` about 20.
- **Adaptive sampling ends bakes early, which makes them noisy.** Turn it off for texture baking (see [hybrid.md](hybrid.md)).
- Shadow caustics (MNEE) ignore volume absorption. If the viewer tints liquid per channel, rely on plain path-traced caustics and a larger light source.

## Materials that read as real

- **Window panes:** give panes real thickness (a Solidify modifier) with a transmissive Principled BSDF. If a pane must be a single plane, turn on the Principled BSDF's `Thin Wall` input (Blender 5.x). Do not hand-flip IOR on back faces: Cycles already inverts IOR there, and a zero-thickness plane with plain glass traps the sun through total internal reflection above about 41°.
- **Liquids in glass:** make the liquid slightly smaller than the inner wall. Put color in a Volume Absorption node (whisky: color about (0.93, 0.55, 0.16), density about 16), not in base color.
- **Wood:** a noise texture stretched about 30:1 along the grain, plus a low-frequency figure noise, gives long streaks. Wave-band textures with heavy distortion read as zigzags.
- **Fruit and wax:** subsurface weight 0.3–1.0 with a small scale (0.004–0.012 m), and a Voronoi-distance bump for pores.
- **Flames:** emission tinted about 1850 K. Whiter flames turn cyan under warm white balance.
- **Pale stone and plaster** blow out under several lights. Keep albedo at or below 0.6.

## Encoding and the viewer

`encode_hdr_atlas.py` stores `x = linear / scale`, `y = x / (1 + x)`, `v = y^(1/2.2)` in 8-bit WebP. It uses one scale per pass across all views, and packs the passes into a grid atlas per view. Scale choice matters:

- A low scale pushes highlights into the top codes. WebP's 4:2:0 chroma then shows color blocks and green halos around lamps.
- A very high scale, from a tiny and very bright flame, starves dim areas of codes, and they band when the viewer boosts that light.
- The default `p99.9 / 6`, clamped to between 1x and 4x the mean, handled every pass tested so far. Use `--lossless` for small or critical plates.

In the viewer, cross-fade views with a sharpened blend so frames spend little time double-exposed. Keep only a few decoded views on the GPU. Load the center view first and let the rest stream in.
