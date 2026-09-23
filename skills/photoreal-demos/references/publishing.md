# Publishing

## Claude artifacts (when the Artifact tool is available)

Publish `index.html` with the `Artifact` tool, and pass every asset in `files` (`{"assets/v00.webp": "<path>", ...}`), a one-sentence `description`, and a one-word generic `icon`. Load the tool's design guidance first if it asks you to. These rules are enforced by the viewer's content security policy:

- Author the page without `<html>`, `<head>` or `<body>` tags. Start with `<meta charset="utf-8">` and a `<title>`: a short, distinctive name of 2–4 words, never "Name: explainer".
- Scripts load only from `https://cdn.jsdelivr.net/npm/` or `https://cdnjs.cloudflare.com`. Stylesheets load only from Google Fonts. Everything else is inline or a published file.
- The only runtime network access is to relative published files: `fetch('assets/x.json')`, `img.src = 'assets/v00.webp'`, `GLTFLoader.load('assets/scene.glb')`.
- Size limits: page ≤ 16 MB; each text file ≤ 16 MB; each binary ≤ 15 MB; ≤ 64 MB and ≤ 255 files per version. Keep a demo's assets at or below about 25 MB so it loads quickly.
- `alert`, `confirm`, `prompt`, downloads and `window.print` do nothing. Start audio only from a click.
- Fixed UI adds `env(safe-area-inset-*)` to its own padding. A dark single-theme page must paint `html, body` explicitly and set `color-scheme: dark`.
- Published artifacts are private to their owner until shared. Tell the user when a page is meant for others.

## Anywhere else

The page is static. Any static host serves it unchanged: GitHub Pages, Netlify, Cloudflare Pages, S3, or `python3 -m http.server`. Keep `index.html` and `assets/` together, and serve over HTTP, never `file://`.

## A gallery for several demos

When you publish more than one demo, keep one index page. Give each demo a card with a 16:9 WebP thumbnail (a `shot.py` screenshot downscaled to 800×450), the technique, one sentence on what it is, and one "Try: ..." hint that names a real control. Update the same gallery for every new demo, rather than creating a new one each time.
