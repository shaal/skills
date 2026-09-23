# Hybrid demos: Blender bakes, three.js renders

Blender does the expensive light transport once. three.js keeps the scene explorable. On the page, say in one line what was baked and what runs live.

## Pick a hybrid pattern

| Pattern | Blender produces | three.js does live |
| --- | --- | --- |
| Baked lightmaps (archviz walk) | glTF with a second UV set plus one lightmap per light group | Walks, remixes groups by time of day, adds sun shafts, dust, reflections |
| Light-group panoramas | Equirect renders per light group plus a distance pass | 360° look-around, relighting, volumetric shafts against the depth |
| Custom HDRIs or cubemaps | Studio or sky panoramas (Cycles panoramic camera) | PBR product lit by `PMREMGenerator` environments; switch between them |
| Baked textures (PBR sets) | Albedo, normal, roughness, AO from procedural shaders | Configurators, material explorers |
| glTF geometry | Procedural models (geometry nodes, bmesh) | Wind, interaction, many instances |
| Baked simulations | Cloth, rigid body or fluid frames as glTF animation, shape keys or vertex-animation textures | Playback, scrubbing, speed and wind control |
| Impostors | Octahedral or multi-view atlases of trees and props | Tens of thousands of instances at distance |
| Depth + color plate | A render plus its depth | 2.5D parallax "living photo" with rain or fog |

## Lightmaps that hold up

- **Second UV set.** Give every baked mesh its own non-overlapping UV layer for the lightmap. In background mode, `bpy.ops.uv.smart_project` on a multi-object edit may unwrap only one object. Unwrap per object, or build your own planar charts, then pack with `bpy.ops.uv.pack_islands(margin=...)` and leave a gutter of 4–8 px at the final resolution.
- **Bake settings.** Bake type `DIFFUSE` with direct and indirect on and color off gives pure irradiance, which lets three.js multiply it by any albedo, including tiling textures. **Turn adaptive sampling off for bakes**: it stops early and leaves noise.
- **One lightmap per light group.** Bake with only that group's lights enabled, at physical units (lumens, lux). The viewer remixes them like the relight viewer does.
- **Denoise.** Bake a world-normal atlas too, and use it as the OIDN normal input. An island-aware, normal-guided blur before OIDN removes the remaining speckle without bleeding across charts.
- **Check normals.** Hand-built quads with inverted normals get culled in three.js and baked from the wrong side.
- **Encode** lightmaps with the same curve as the relight atlases. The loft demo found `p99.5 / 4` a good scale for sun patches. When saving albedo with alpha as WebP, pass `exact=True`, or lossy WebP destroys RGB where alpha is 0.

## glTF export and loading

```python
bpy.ops.export_scene.gltf(filepath="assets/scene.glb", export_format="GLB",
                          export_texcoords=True, export_normals=True, export_apply=True, export_yup=True)
```

- Split meshes by material, so each three.js material can take its own maps.
- The second UV layer becomes `TEXCOORD_1`, which three.js loads as the `uv1` attribute. Set `lightMap.channel = 1` (three.js r151+).
- Axes: Blender is Z-up, three.js is Y-up. The exporter converts, so a Blender point `(x, y, z)` arrives as `(x, z, -y)`. Keep this in mind when you place lights, probes or colliders in JavaScript.
- Load with `GLTFLoader` from the pinned addons path. Publish `.glb` files with `contentType: "model/gltf-binary"`. If a host refuses that type, ship `.bin` plus `.json`, or a `.js` data module.

## Reflections and probes

- Render a 1024×512 equirect probe from the room's center with Cycles light groups, denoised per group. Remix it with the same weights as the lightmaps, then run `PMREMGenerator.fromEquirectangular()`.
- For rooms, box-project the probe (parallax-corrected cubemap), so reflections line up with the walls.
- Use the lightmap to occlude specular (for example, `sqrt(lightmap / average)`), so dark corners do not reflect the sky.

## Panoramas

```python
cam.data.type = "PANO"
cam.data.panorama_type = "EQUIRECTANGULAR"
```

- A 4096×2048 panorama has about 11 px per degree. Do not let the viewer zoom narrower than about 46° of field of view, or the image goes soft. For deeper zoom, render larger.
- Render a distance pass alongside the panorama for live effects (shafts, fog) that must stop at geometry.
- Document your equirect convention (which `u` faces north, and where `v = 0` is) in the page's code. Off-by-quarter-turn mistakes are the common bug.

## Mixing on the GPU

Combine lightmaps into one half-float render target only when the controls change (every other frame during a transition), not every frame. Then shade with the combined map. This keeps a 5-group loft at about 8 ms per frame.
