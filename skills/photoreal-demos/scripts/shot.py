#!/usr/bin/env python3
"""Screenshot a WebGL page in real Chrome with the GPU enabled, run JS steps, report fps and console output.

Usage:
  python shot.py <url> <out.png> [--w 1600] [--h 900] [--wait 8000]
                 [--js "<expression>" ...] [--wait-after 1500] [--fps] [--mobile] [--headed]

- Each --js expression runs after the wait (it may return a Promise), then a screenshot is
  saved as <out>_1.png, <out>_2.png, ...
- --fps counts requestAnimationFrame callbacks for 2 s and prints the rate.
- --mobile emulates a phone: touch, (pointer: coarse), devicePixelRatio 2. Use it with --w 400 --h 860
  so the page's touch path is exercised. It also reports horizontal overflow.
- The viewport actually applied is printed; compare it with what you asked for.
- Console messages and page errors are printed at the end. Treat [pageerror] lines as failures.

Needs: pip install playwright && python -m playwright install chromium
Installed Google Chrome is preferred (its GPU path matches what users run); `python -m playwright install chrome`
installs it where that is supported. Without a GPU the renderer line shows SwiftShader: screenshots still work,
but fps readings mean nothing.
"""
import argparse, asyncio, platform, sys

try:
    from playwright.async_api import async_playwright
except ImportError:
    sys.exit("playwright is missing: pip install playwright && python -m playwright install chromium")

p = argparse.ArgumentParser()
p.add_argument("url"); p.add_argument("out")
p.add_argument("--w", type=int, default=1600); p.add_argument("--h", type=int, default=900)
p.add_argument("--wait", type=int, default=8000, help="ms to wait after load before the first screenshot")
p.add_argument("--js", action="append", default=[], help="expression to evaluate, then screenshot")
p.add_argument("--wait-after", type=int, default=1500, help="ms to wait after each --js")
p.add_argument("--fps", action="store_true", help="measure requestAnimationFrame rate for 2 s")
p.add_argument("--mobile", action="store_true", help="emulate a touch phone (coarse pointer, DPR 2)")
p.add_argument("--headed", action="store_true")
a = p.parse_args()

# Pick the native ANGLE backend so WebGL runs on the real GPU instead of a software rasterizer.
ANGLE = {"Darwin": "metal", "Windows": "d3d11", "Linux": "vulkan"}.get(platform.system(), "default")
ARGS = ["--enable-gpu", "--ignore-gpu-blocklist", f"--use-angle={ANGLE}", "--enable-unsafe-webgpu"]
if platform.system() == "Linux":
    ARGS += ["--enable-features=Vulkan", "--use-gl=angle", "--disable-vulkan-surface"]

FPS_JS = """new Promise(res => { let n = 0; const t0 = performance.now();
  function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res((n / 2).toFixed(1)); }
  requestAnimationFrame(f); })"""
RENDERER_JS = """(() => { try { const gl = document.createElement('canvas').getContext('webgl2');
  const d = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return gl ? (d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'webgl2 (renderer hidden)') : 'NO WEBGL2'; } catch (e) { return 'error ' + e; } })()"""


async def launch(pw):
    try:
        return await pw.chromium.launch(channel="chrome", headless=not a.headed, args=ARGS)
    except Exception:
        print("note: Google Chrome not found, using Playwright's Chromium (new headless mode)")
        try:
            return await pw.chromium.launch(channel="chromium", headless=not a.headed, args=ARGS)
        except Exception:
            return await pw.chromium.launch(headless=not a.headed, args=ARGS)


async def main():
    async with async_playwright() as pw:
        b = await launch(pw)
        opts = {"viewport": {"width": a.w, "height": a.h}}
        if a.mobile:
            opts.update(is_mobile=True, has_touch=True, device_scale_factor=2)
        pg = await (await b.new_context(**opts)).new_page()
        logs = []
        pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
        pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
        await pg.goto(a.url)
        await pg.wait_for_timeout(a.wait)
        print("viewport", await pg.evaluate("[innerWidth, innerHeight]"), "requested", [a.w, a.h])
        print("renderer", await pg.evaluate(RENDERER_JS))
        if a.mobile and await pg.evaluate("innerWidth") != a.w:
            print(f"warning: layout width is not {a.w}px; the page probably lacks <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">")
        if a.mobile:
            print("coarse pointer", await pg.evaluate("matchMedia('(pointer: coarse)').matches"),
                  "| horizontal overflow", await pg.evaluate("document.documentElement.scrollWidth > innerWidth"))
        if a.fps:
            print("fps", await pg.evaluate(FPS_JS))
        await pg.screenshot(path=a.out)
        print("saved", a.out)
        stem = a.out[:-4] if a.out.lower().endswith(".png") else a.out
        for i, js in enumerate(a.js):
            try:
                r = await pg.evaluate(js)
                if r is not None:
                    print("js", i + 1, "->", r)
            except Exception as e:
                print("js", i + 1, "error", str(e).splitlines()[0])
            await pg.wait_for_timeout(a.wait_after)
            out = f"{stem}_{i + 1}.png"
            await pg.screenshot(path=out)
            print("saved", out)
        for line in logs[-60:]:
            print(line)
        await b.close()

asyncio.run(main())
