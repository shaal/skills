# Setup

Run these checks once per machine. Fix what fails before you build.

## 1. Python packages

Use one Python 3.10+ interpreter for every script in this skill. The docs write `python3`; on Windows use `py -3` or `python`. Homebrew Python and recent Debian or Ubuntu refuse system-wide `pip install`, so use a virtual environment:

```sh
python3 -m venv .venv
. .venv/bin/activate              # Windows: .venv\Scripts\activate
python3 -m pip install playwright numpy opencv-python pillow
python3 -m playwright install chromium
python3 -m playwright install chrome   # optional: Google Chrome, preferred for GPU screenshots where supported
```

- `playwright` drives Chrome for screenshots (`scripts/shot.py`).
- `numpy`, `opencv-python` and `pillow` read EXR files and write WebP (`scripts/encode_hdr_atlas.py`, `scripts/preview_exr.py`). The scripts set `OPENCV_IO_ENABLE_OPENEXR=1` for you.

If several Pythons are installed, check which one has Playwright with `python3 -c "import playwright"` and call that one explicitly.

## 2. A local server

Serve over HTTP. Opening `index.html` from `file://` breaks relative `fetch()` and module imports. Serve the project root, not a demo folder, so every demo is reachable. First make sure the port is free, because another tool may already own a common one like 8000 or 8765:

```sh
lsof -iTCP:<port> -sTCP:LISTEN           # macOS
ss -ltnp | grep :<port>                  # Linux
netstat -ano | findstr :<port>           # Windows
python3 -m http.server <port> --bind 127.0.0.1
```

## 3. A GPU in Chrome

`shot.py` prefers installed Google Chrome, because its GPU path matches what viewers run. Check the GPU with an example from this skill. In a second terminal, serve the skill folder:

```sh
cd <skill_dir> && python3 -m http.server <port2> --bind 127.0.0.1
python3 <skill_dir>/scripts/shot.py http://127.0.0.1:<port2>/examples/rain-alley.html check.png --wait 8000 --fps
```

The `renderer` line must name your GPU, for example `ANGLE Metal Renderer: Apple M3 Max`, `ANGLE (NVIDIA ...)` or `ANGLE (AMD ...)`. If it says `SwiftShader` or `llvmpipe`, WebGL is running on the CPU. Screenshots still work, but fps readings and heavy shaders do not; follow the no-GPU note in SKILL.md. On Linux, install the vendor Vulkan driver. You only need `xvfb-run` when you pass `--headed` without a display.

## 4. Blender 5.2+ (Blender and hybrid demos only)

`blender` is usually not on the PATH. Set a `BLENDER` variable to the binary and use it everywhere:

```sh
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender                 # macOS
BLENDER="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"    # Windows (Git Bash); in PowerShell use $env:BLENDER
BLENDER=~/blender-5.2.2-linux-x64/blender                                # Linux: wherever you extracted it
"$BLENDER" --version
```

Install or upgrade from <https://www.blender.org/download/>. The release folders at `https://download.blender.org/release/Blender5.2/` publish a `.sha256` file; check the download against it.

- **macOS:** mount the `.dmg` and copy `Blender.app` into `/Applications`. The binary is `/Applications/Blender.app/Contents/MacOS/Blender`.
- **Windows:** use the installer or `winget install BlenderFoundation.Blender`. The binary is `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`.
- **Linux:** extract the `.tar.xz` and run `blender` from that folder, or use your distribution's package if it ships 5.2+.

Always run scripts headless with the factory settings, so personal preferences never change a render:

```sh
"$BLENDER" -b --factory-startup --python my_scene.py -- <out_dir> <samples> <views>
```

The template picks the first working GPU backend (Metal, OptiX, CUDA, HIP, oneAPI) and prints it, for example `Cycles device: METAL`. The first render with a new mix of features compiles GPU kernels, which takes a few minutes. Later renders reuse the cache.

The template is tested on Blender 5.2 and needs the 5.0+ API. Blender 5.x changed the compositor API; if you adapt older 4.x scripts, read the API notes in [blender.md](blender.md).

## 5. Disk space

Blender demos write EXR intermediates: about 2.5 MB per pass per view at 1440×810. Keep at least 10 GB free, write intermediates outside the repository, and delete them after encoding.
