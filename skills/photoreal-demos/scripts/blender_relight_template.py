"""Blender 5.2+ template: a procedural Cycles scene rendered as one denoised EXR per light group per camera view.

This is the working "Still Life in Amber" scene (whisky glass, decanter, candle, lemons, window sun).
To make your own demo, keep the sections marked KEEP and replace the ones marked REPLACE:
  KEEP     render settings, helpers, light groups + compositor, camera loop
  REPLACE  materials, room and props, lights, camera path, GROUPS

Copy this file into your project before editing it; do not edit the installed skill.
Run (tested on Blender 5.2; needs the 5.0+ API; BLENDER is the Blender binary, see references/setup.md):
  $BLENDER -b --factory-startup --python blender_relight_template.py -- <out_dir> <samples> <views> [<only_view>]
Output: <out_dir>/v00/<group>.exr, v01/..., one half-float EXR per light group, OIDN-denoised per group.
Then:   python encode_hdr_atlas.py <out_dir> <page>/assets, and copy assets/relight-viewer.html to <page>/index.html.

Light is additive, so the viewer can remix the groups with any weights and colors and the result
matches a real re-render. The GPU backend is picked automatically (Metal, OptiX, CUDA, HIP, oneAPI).
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix, Euler

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
import tempfile
OUT = argv[0] if len(argv) > 0 else os.path.join(tempfile.gettempdir(), "relight_render")
SAMPLES = int(argv[1]) if len(argv) > 1 else 256
VIEWS = int(argv[2]) if len(argv) > 2 else 1
ONLY = int(argv[3]) if len(argv) > 3 else -1
RES = (1440, 810)
os.makedirs(OUT, exist_ok=True)

scene = bpy.context.scene
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

# ------------------------------------------------------------------ KEEP: render settings
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
GPU = None
for backend in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):  # first backend with a usable GPU wins
    try:
        prefs.compute_device_type = backend
    except TypeError:
        continue
    prefs.get_devices()
    if any(d.type == backend for d in prefs.devices):
        GPU = backend
        break
for d in prefs.devices:
    d.use = d.type == GPU
scene.cycles.device = "GPU" if GPU else "CPU"
print("Cycles device:", GPU or "CPU (no GPU backend found)")
scene.cycles.samples = SAMPLES
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.006
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 24
scene.cycles.diffuse_bounces = 6
scene.cycles.glossy_bounces = 12
scene.cycles.transmission_bounces = 24
scene.cycles.transparent_max_bounces = 16
scene.cycles.caustics_reflective = True
scene.cycles.caustics_refractive = True
scene.cycles.blur_glossy = 0.2
scene.cycles.sample_clamp_indirect = 20.0
scene.render.resolution_x, scene.render.resolution_y = RES
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.view_settings.view_transform = "Standard"

# ------------------------------------------------------------------ KEEP: helpers
def material(name, **p):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    for k, v in p.items():
        b.inputs[k].default_value = v
    return m, b

def link(m, a, b):
    m.node_tree.links.new(a, b)

def new_obj(name, mesh):
    o = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(o)
    return o

def lathe(name, profile, segs=128, subsurf=2):
    """Revolve an (r, z) profile around Z. Points with r == 0 become poles."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)])
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for i in range(segs):
                bm.faces.new((a[0], b[(i + 1) % segs], b[i]))
        elif len(b) == 1:
            for i in range(segs):
                bm.faces.new((a[i], a[(i + 1) % segs], b[0]))
        else:
            for i in range(segs):
                bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = new_obj(name, me)
    if subsurf:
        s = o.modifiers.new("sub", "SUBSURF")
        s.levels = 1
        s.render_levels = subsurf
    return o

def box(name, size, loc, mat=None, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = new_obj(name, me)
    o.location = loc
    if bevel:
        b = o.modifiers.new("bev", "BEVEL")
        b.width = bevel
        b.segments = 3
        for p in me.polygons:
            p.use_smooth = True
    if mat:
        o.data.materials.append(mat)
    return o

def sphere(name, r, loc, scale=(1, 1, 1), segs=64, rings=32):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = new_obj(name, me)
    o.location = loc
    o.scale = scale
    return o

def caustics(o, caster=False, receiver=False):
    for attr, val in (("is_caustics_caster", caster), ("is_caustics_receiver", receiver)):
        for tgt in (o, getattr(o, "cycles", None)):
            if tgt is not None and hasattr(tgt, attr):
                setattr(tgt, attr, val)

# ------------------------------------------------------------------ REPLACE: materials
glass, _ = material("glass", **{"Base Color": (1, 1, 1, 1), "Transmission Weight": 1.0, "Roughness": 0.0, "IOR": 1.52})
water, _ = material("water", **{"Transmission Weight": 1.0, "Roughness": 0.0, "IOR": 1.333})
ice, ib = material("ice", **{"Transmission Weight": 1.0, "Roughness": 0.08, "IOR": 1.31})
n = ice.node_tree.nodes; nz = n.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 90; bmp = n.new("ShaderNodeBump"); bmp.inputs["Strength"].default_value = 0.08
link(ice, nz.outputs["Fac"], bmp.inputs["Height"]); link(ice, bmp.outputs["Normal"], ib.inputs["Normal"])

whisky, wb = material("whisky", **{"Transmission Weight": 1.0, "Roughness": 0.0, "IOR": 1.36, "Base Color": (1.0, 0.72, 0.36, 1)})
va = whisky.node_tree.nodes.new("ShaderNodeVolumeAbsorption")
va.inputs["Color"].default_value = (0.93, 0.55, 0.16, 1)
va.inputs["Density"].default_value = 16.0
link(whisky, va.outputs["Volume"], whisky.node_tree.nodes["Material Output"].inputs["Volume"])

# walnut table: stretched noise gives long grain along X, a second noise gives figure
walnut, wbsdf = material("walnut", **{"Roughness": 0.4, "Coat Weight": 0.6, "Coat Roughness": 0.05, "Specular IOR Level": 0.5})
wn = walnut.node_tree.nodes
tc = wn.new("ShaderNodeTexCoord")
mp = wn.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (1.2, 34.0, 1.2)
grain = wn.new("ShaderNodeTexNoise"); grain.inputs["Scale"].default_value = 2.2; grain.inputs["Detail"].default_value = 9; grain.inputs["Distortion"].default_value = 0.6
mp2 = wn.new("ShaderNodeMapping"); mp2.inputs["Scale"].default_value = (0.6, 5.0, 0.6)
fig = wn.new("ShaderNodeTexNoise"); fig.inputs["Scale"].default_value = 1.6; fig.inputs["Detail"].default_value = 3
ramp = wn.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.3; ramp.color_ramp.elements[0].color = (0.028, 0.012, 0.006, 1)
ramp.color_ramp.elements[1].position = 0.72; ramp.color_ramp.elements[1].color = (0.13, 0.062, 0.026, 1)
mix = wn.new("ShaderNodeMix"); mix.data_type = "FLOAT"; mix.inputs["Factor"].default_value = 0.4
link(walnut, tc.outputs["Object"], mp.inputs["Vector"]); link(walnut, mp.outputs["Vector"], grain.inputs["Vector"])
link(walnut, tc.outputs["Object"], mp2.inputs["Vector"]); link(walnut, mp2.outputs["Vector"], fig.inputs["Vector"])
link(walnut, grain.outputs["Fac"], mix.inputs[2]); link(walnut, fig.outputs["Fac"], mix.inputs[3])
link(walnut, mix.outputs[0], ramp.inputs["Fac"]); link(walnut, ramp.outputs["Color"], wbsdf.inputs["Base Color"])
wrough = wn.new("ShaderNodeMapRange"); wrough.inputs["To Min"].default_value = 0.28; wrough.inputs["To Max"].default_value = 0.5
link(walnut, grain.outputs["Fac"], wrough.inputs["Value"]); link(walnut, wrough.outputs["Result"], wbsdf.inputs["Roughness"])
wbump = wn.new("ShaderNodeBump"); wbump.inputs["Strength"].default_value = 0.04
link(walnut, grain.outputs["Fac"], wbump.inputs["Height"]); link(walnut, wbump.outputs["Normal"], wbsdf.inputs["Normal"])

plaster, pb = material("plaster", **{"Base Color": (0.62, 0.57, 0.5, 1), "Roughness": 0.92})
pn = plaster.node_tree.nodes; pno = pn.new("ShaderNodeTexNoise"); pno.inputs["Scale"].default_value = 18; pno.inputs["Detail"].default_value = 10
pbm = pn.new("ShaderNodeBump"); pbm.inputs["Strength"].default_value = 0.12
link(plaster, pno.outputs["Fac"], pbm.inputs["Height"]); link(plaster, pbm.outputs["Normal"], pb.inputs["Normal"])
paint, _ = material("paint", **{"Base Color": (0.72, 0.7, 0.64, 1), "Roughness": 0.4})
dark, _ = material("dark", **{"Base Color": (0.05, 0.045, 0.04, 1), "Roughness": 0.8})

brass, bb = material("brass", **{"Base Color": (0.86, 0.62, 0.3, 1), "Metallic": 1.0, "Roughness": 0.22})
bn = brass.node_tree.nodes; bno = bn.new("ShaderNodeTexNoise"); bno.inputs["Scale"].default_value = 60
brr = bn.new("ShaderNodeMapRange"); brr.inputs["To Min"].default_value = 0.14; brr.inputs["To Max"].default_value = 0.34
link(brass, bno.outputs["Fac"], brr.inputs["Value"]); link(brass, brr.outputs["Result"], bb.inputs["Roughness"])

wax, _ = material("wax", **{"Base Color": (0.9, 0.84, 0.72, 1), "Roughness": 0.35, "Subsurface Weight": 1.0,
                             "Subsurface Radius": (1.0, 0.6, 0.35), "Subsurface Scale": 0.012})
flame, fb = material("flame", **{"Base Color": (0, 0, 0, 1), "Emission Color": (1, 1, 1, 1), "Emission Strength": 45.0})

lemon, lb = material("lemon", **{"Base Color": (0.66, 0.43, 0.035, 1), "Roughness": 0.5, "Subsurface Weight": 0.35,
                                  "Subsurface Radius": (1.0, 0.8, 0.2), "Subsurface Scale": 0.004, "Coat Weight": 0.2})
ln = lemon.node_tree.nodes; lno = ln.new("ShaderNodeTexVoronoi"); lno.inputs["Scale"].default_value = 650
lbm = ln.new("ShaderNodeBump"); lbm.inputs["Strength"].default_value = 0.45; lbm.inputs["Distance"].default_value = 0.0008
link(lemon, lno.outputs["Distance"], lbm.inputs["Height"]); link(lemon, lbm.outputs["Normal"], lb.inputs["Normal"])

cherry, _ = material("cherry", **{"Base Color": (0.22, 0.004, 0.012, 1), "Roughness": 0.18, "Coat Weight": 1.0, "Coat Roughness": 0.03,
                                   "Subsurface Weight": 0.25, "Subsurface Radius": (1.0, 0.1, 0.1), "Subsurface Scale": 0.003})
stem, _ = material("stem", **{"Base Color": (0.12, 0.13, 0.03, 1), "Roughness": 0.6})
ceramic, _ = material("ceramic", **{"Base Color": (0.8, 0.78, 0.72, 1), "Roughness": 0.12, "Coat Weight": 0.6, "Coat Roughness": 0.02})

# ------------------------------------------------------------------ REPLACE: room and props
table = box("table", (2.2, 1.5, 0.05), (0.15, 0.1, -0.025), walnut)
caustics(table, receiver=True)
box("back_wall", (4.0, 0.2, 3.4), (0.4, 0.95, 0.9), plaster)
box("floor", (4.0, 4.4, 0.1), (0.4, -1.1, -0.85), dark)
box("ceiling", (4.0, 4.4, 0.1), (0.4, -1.1, 2.55), plaster)
box("right_wall", (0.2, 4.4, 3.4), (2.3, -1.1, 0.9), plaster)
box("front_wall", (4.0, 0.2, 3.4), (0.4, -3.2, 0.9), plaster)
# left wall with a window opening y in [-0.75, 0.35], z in [0.2, 1.5]
WX = -1.25
box("lw_a", (0.25, 2.5, 3.4), (WX, -2.0, 0.9), plaster)
box("lw_b", (0.25, 0.6, 3.4), (WX, 0.65, 0.9), plaster)
box("lw_c", (0.25, 1.1, 0.95), (WX, -0.2, -0.275), plaster)
box("lw_d", (0.25, 1.1, 1.05), (WX, -0.2, 2.075), plaster)
box("mullion_v", (0.22, 0.035, 1.3), (WX, -0.2, 0.85), paint)
box("mullion_h", (0.22, 1.1, 0.035), (WX, -0.2, 0.9), paint)
box("sill", (0.34, 1.2, 0.04), (WX + 0.03, -0.2, 0.19), paint)

# ------------------------------------------------------------------ REPLACE: props
tumbler = lathe("tumbler", [(0, 0), (0.034, 0), (0.0395, 0.0015), (0.0415, 0.006), (0.0432, 0.088), (0.0428, 0.0906), (0.0404, 0.0906),
                            (0.0398, 0.088), (0.0386, 0.021), (0.034, 0.0158), (0, 0.0152)])
tumbler.data.materials.append(glass); tumbler.location = (-0.03, -0.04, 0)
caustics(tumbler, caster=True)
liquid = lathe("whisky", [(0, 0.0156), (0.0336, 0.016), (0.0381, 0.0205), (0.0388, 0.05), (0, 0.05)], subsurf=1)
liquid.data.materials.append(whisky); liquid.location = tumbler.location
for i, (dx, dy, dz, rx, ry, rz) in enumerate([(0.008, 0.006, 0.047, 0.3, 0.5, 0.2), (-0.012, -0.004, 0.054, -0.4, 0.2, 0.9)]):
    c = box(f"ice{i}", (0.026, 0.026, 0.024), (tumbler.location.x + dx, tumbler.location.y + dy, dz), ice, bevel=0.004)
    c.rotation_euler = (rx, ry, rz)

deca = lathe("decanter", [(0, 0), (0.06, 0), (0.075, 0.01), (0.085, 0.05), (0.086, 0.09), (0.075, 0.14), (0.04, 0.18), (0.024, 0.205),
                          (0.022, 0.25), (0.0275, 0.262), (0.0255, 0.266), (0.019, 0.262), (0.019, 0.25), (0.021, 0.205), (0.037, 0.178),
                          (0.072, 0.139), (0.083, 0.09), (0.082, 0.05), (0.072, 0.013), (0.058, 0.006), (0, 0.006)])
deca.data.materials.append(glass); deca.location = (-0.21, 0.15, 0)
caustics(deca, caster=True)
dw = lathe("decanter_water", [(0, 0.0065), (0.057, 0.0068), (0.0708, 0.0135), (0.0812, 0.05), (0.0822, 0.09), (0.0782, 0.112), (0, 0.112)], subsurf=1)
dw.data.materials.append(water); dw.location = deca.location

holder = lathe("holder", [(0, 0), (0.058, 0), (0.06, 0.004), (0.052, 0.01), (0.018, 0.016), (0.012, 0.03), (0.01, 0.06), (0.016, 0.07),
                          (0.03, 0.074), (0.031, 0.08), (0.024, 0.082), (0.0215, 0.078), (0, 0.078)])
holder.data.materials.append(brass); holder.location = (0.2, 0.19, 0)
candle = lathe("candle", [(0, 0.075), (0.0212, 0.075), (0.0212, 0.2), (0.0195, 0.204), (0.012, 0.201), (0, 0.199)], subsurf=2)
candle.data.materials.append(wax); candle.location = holder.location
wick = box("wick", (0.0014, 0.0014, 0.012), (holder.location.x, holder.location.y, 0.205), dark)
fl = sphere("flame", 0.0055, (holder.location.x, holder.location.y, 0.2175), scale=(1, 1, 2.6), segs=24, rings=12)
fl.data.materials.append(flame)
fl.visible_shadow = False

for i, (x, y, rz, s) in enumerate([(0.13, -0.1, 0.5, 1.0), (0.215, -0.035, 2.1, 0.93)]):
    L = sphere(f"lemon{i}", 1.0, (x, y, 0.034 * s), segs=64, rings=48)
    me = L.data
    for v in me.vertices:
        co = v.co.copy()
        tip = abs(co.z) ** 10
        v.co = Vector((co.x * 0.034, co.y * 0.034, co.z * (0.045 + 0.012 * tip)))
    L.scale = (s, s, s)
    L.rotation_euler = (math.pi / 2, 0, rz)
    L.data.materials.append(lemon)

bowl = lathe("bowl", [(0, 0), (0.034, 0), (0.04, 0.004), (0.07, 0.038), (0.076, 0.046), (0.073, 0.048), (0.067, 0.042), (0.037, 0.009), (0, 0.008)])
bowl.data.materials.append(ceramic); bowl.location = (0.02, 0.23, 0)
import random
random.seed(4)
for i in range(9):
    a = i * 2.39996; r = 0.018 + 0.032 * math.sqrt((i + 0.5) / 9)
    x, y = bowl.location.x + math.cos(a) * r, bowl.location.y + math.sin(a) * r
    z = 0.012 + (0.022 if i > 5 else 0.0) + (r - 0.018) * 0.5
    ch = sphere(f"cherry{i}", 0.0115, (x, y, z), scale=(1, 1, 0.92), segs=32, rings=16)
    ch.data.materials.append(cherry)
    cu = bpy.data.curves.new(f"stem{i}", "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = 0.0007; cu.bevel_resolution = 2
    sp = cu.splines.new("BEZIER"); sp.bezier_points.add(1)
    ang = random.uniform(0, 6.28)
    p0 = Vector((x, y, z + 0.0095)); p1 = p0 + Vector((math.cos(ang) * 0.02, math.sin(ang) * 0.02, 0.028))
    sp.bezier_points[0].co = p0; sp.bezier_points[0].handle_left = p0; sp.bezier_points[0].handle_right = p0 + Vector((0, 0, 0.018))
    sp.bezier_points[1].co = p1; sp.bezier_points[1].handle_left = p1 - Vector((math.cos(ang) * 0.01, math.sin(ang) * 0.01, 0.004)); sp.bezier_points[1].handle_right = p1
    so = bpy.data.objects.new(f"stem{i}", cu); scene.collection.objects.link(so); so.data.materials.append(stem)

# ------------------------------------------------------------------ REPLACE: lights, each in its own light group
GROUPS = ("sun", "sky", "candle", "pendant")  # every light, emissive mesh and the world is assigned to one of these
vl = scene.view_layers[0]
for g in GROUPS:
    vl.lightgroups.add(name=g)
vl.cycles.denoising_store_passes = True

sun_dir = Vector((0.82, 0.38, -0.46)).normalized()
sd = bpy.data.lights.new("sun", "SUN"); sd.energy = 6.0; sd.angle = math.radians(1.2)
sun = bpy.data.objects.new("sun", sd); scene.collection.objects.link(sun)
sun.rotation_euler = sun_dir.to_track_quat("-Z", "Y").to_euler()
sun.lightgroup = "sun"
if hasattr(sd, "cycles") and hasattr(sd.cycles, "is_caustics_light"):
    sd.cycles.is_caustics_light = True

world = bpy.data.worlds.new("world"); scene.world = world; world.use_nodes = True
wnodes = world.node_tree.nodes
sky = wnodes.new("ShaderNodeTexSky"); sky.sky_type = "SINGLE_SCATTERING"; sky.sun_disc = False  # "NISHITA" before Blender 5.0
sky.sun_elevation = math.asin(-sun_dir.z); sky.sun_rotation = math.atan2(-sun_dir.x, -sun_dir.y)
world.node_tree.links.new(sky.outputs["Color"], wnodes["Background"].inputs["Color"])
wnodes["Background"].inputs["Strength"].default_value = 0.35
world.lightgroup = "sky"

cl = bpy.data.lights.new("candle", "POINT"); cl.energy = 2.2; cl.shadow_soft_size = 0.004
candle_light = bpy.data.objects.new("candle_light", cl); scene.collection.objects.link(candle_light)
candle_light.location = (holder.location.x, holder.location.y, 0.219)
candle_light.lightgroup = "candle"; fl.lightgroup = "candle"
if hasattr(cl, "cycles") and hasattr(cl.cycles, "is_caustics_light"):
    cl.cycles.is_caustics_light = True

pl = bpy.data.lights.new("pendant", "AREA"); pl.shape = "DISK"; pl.size = 0.42; pl.energy = 70
pendant = bpy.data.objects.new("pendant", pl); scene.collection.objects.link(pendant)
pendant.location = (0.05, 0.12, 1.45); pendant.lightgroup = "pendant"
# shade around the pendant so it reads as a lamp, not a panel
shade = lathe("shade", [(0.05, 0.12), (0.2, 0.0), (0.205, 0.0), (0.055, 0.125)], segs=96, subsurf=1)
shade.data.materials.append(dark); shade.location = (0.05, 0.12, 1.45 - 0.01)
shade.visible_shadow = True

# ------------------------------------------------------------------ REPLACE: camera path (here an orbit arc)
cam_data = bpy.data.cameras.new("cam"); cam_data.lens = 50
cam = bpy.data.objects.new("cam", cam_data); scene.collection.objects.link(cam); scene.camera = cam
cam_data.dof.use_dof = True; cam_data.dof.aperture_fstop = 2.4
TARGET = Vector((0.0, 0.07, 0.085))
FOCUS = Vector((tumbler.location.x, tumbler.location.y, 0.05))
DIST, ELEV, SPAN = 0.9, math.radians(17), math.radians(56)

def place_camera(t):
    az = (t - 0.5) * SPAN
    p = TARGET + DIST * Vector((math.sin(az) * math.cos(ELEV), -math.cos(az) * math.cos(ELEV), math.sin(ELEV)))
    cam.location = p
    cam.rotation_euler = (TARGET - p).to_track_quat("-Z", "Y").to_euler()
    cam_data.dof.focus_distance = (FOCUS - p).dot((TARGET - p).normalized())

# ------------------------------------------------------------------ KEEP: compositor, denoise each light group, write EXR
# Blender 5.x: the compositor is a node group assigned to the scene, the Composite node is gone (use Group Output),
# Denoise options are input sockets, and File Output takes a directory plus one item per input.
tree = bpy.data.node_groups.new("Compositor", "CompositorNodeTree")
scene.compositing_node_group = tree
rl = tree.nodes.new("CompositorNodeRLayers")
gout = tree.nodes.new("NodeGroupOutput")
tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
tree.links.new(rl.outputs["Image"], gout.inputs[0])
fo = tree.nodes.new("CompositorNodeOutputFile")
fo.format.media_type = "IMAGE"; fo.format.file_format = "OPEN_EXR"; fo.format.color_depth = "16"; fo.format.exr_codec = "ZIP"
fo.file_name = ""  # files land as <directory>/<group>.exr
for g in GROUPS:
    dn = tree.nodes.new("CompositorNodeDenoise")
    dn.inputs["Prefilter"].default_value = "Accurate"; dn.inputs["HDR"].default_value = True; dn.inputs["Quality"].default_value = "High"
    tree.links.new(rl.outputs[f"Combined_{g}"], dn.inputs["Image"])
    tree.links.new(rl.outputs["Denoising Normal"], dn.inputs["Normal"])
    tree.links.new(rl.outputs["Denoising Albedo"], dn.inputs["Albedo"])
    fo.file_output_items.new("RGBA", g)
    tree.links.new(dn.outputs["Image"], fo.inputs[g])

import time
views = range(VIEWS) if ONLY < 0 else [ONLY]
for i in views:
    t = 0.5 if VIEWS == 1 else i / (VIEWS - 1)
    place_camera(t)
    fo.directory = os.path.join(OUT, f"v{i:02d}")
    t0 = time.time()
    bpy.ops.render.render(write_still=False)
    print(f"VIEW {i} rendered in {time.time() - t0:.1f}s", flush=True)
