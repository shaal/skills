# Building many demos

For requests like "make 20 of these", run several builders in parallel, each owning one demo end to end. These rules come from a real 100-demo run that stalled overnight and then recovered.

## 1. Write the concept list

Keep a `concepts.json` in the project:

```json
[
  { "n": 1, "slug": "storm-lighthouse", "tech": "three.js",
    "concept": "A lighthouse in a storm: FFT ocean with foam, spray, rain and a sweeping beam; a Beaufort slider from calm to gale.",
    "status": "todo", "url": "" }
]
```

Every concept names a subject, a technique and one hero interaction. Mix techniques on purpose. Builders update `status` and `url` when they publish, so a later run picks up where the last one stopped.

## 2. Write a shared brief

Put everything a builder needs in one file that every builder reads first. Include the project paths, the folder convention (`demos/<NNN>-<slug>/`), a pointer to this skill, the local server port, a per-builder scratch directory outside the repository, a render budget, disk rules, and the report format. Tell builders to continue from files an earlier, interrupted attempt left in their folder, instead of starting over.

## 3. Run about three builders at a time

Each Blender job wants the whole GPU, and the screenshot checks need GPU time too. Three parallel builders keep the GPU busy without starving any of them. Split the work into fixed lanes: at most two lanes run Blender-heavy concepts, and the rest run three.js concepts. Each lane builds its demos one after another.

With a workflow tool, give each builder a structured result schema: `index`, `slug`, `title`, `tech`, `url`, `status` (`published` or `failed`), `summary`, `verification` and `notes`.

A demo takes about 30–60 minutes, so 3 lanes deliver roughly 3–5 demos per hour.

## 4. Keep the machine awake

A background run does not stop the OS from sleeping. When the machine sleeps, builders' requests stall, get interrupted, and restart from scratch.

- **macOS:** keep it on AC power with the lid open, and run `caffeinate -dimsu` for the length of the run. On battery, `-s` is ignored.
- **Linux:** `systemd-inhibit --what=sleep:idle <command>`.
- **Windows:** `powercfg /change standby-timeout-ac 0` for the length of the run, then restore it.

Check the power state before launching, and release the keep-awake lock when the run ends.

## 5. Check the first result before trusting the rest

When the first demo lands, screenshot it yourself and critique it. A problem in the brief repeats in every later builder, so fix the brief before the others reach that step. Watch for these as well:

- **Restarts:** the same demo starting twice usually means the machine slept.
- **Failures:** read the builder's notes, fix the cause in the brief, then retry.
- **Disk:** Blender intermediates add up. Stop if free space drops below about 10 GB.

## 6. Stopping gracefully

To stop after the demos in progress, add a notice at the top of the brief. It lists the demo numbers that may finish, and tells every other builder to return `failed` with "skipped" right away, without creating files. Stop the run once the listed demos publish. Remove the notice afterwards, or the next run skips everything.

## 7. Finish

Update the concept list and the gallery (see [publishing.md](publishing.md)). Report a table of the new demos with their links and any failures with their reasons.
