# Building many demos

For requests like "make 20 of these", run several builders in parallel, each owning one demo end to end. These rules come from two real runs. The first run stalled overnight and then recovered. The second run built 33 demos with up to 18 agents at once, and it hit the account's usage limit.

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

## 3. Pace to the usage limit, not to the machine

The account's usage limit sets the pace, not the number of parallel builders. In the second run, 18 parallel agents used about 14M subagent tokens and hit the session usage limit after about 1.7 hours. The limit applies to the whole account, so it also blocked the user's other sessions until the reset. More workers only reach the limit sooner.

- Run about five workers. One demo used about 0.8M subagent tokens, including its critic and fix pass. Five workers ran for more than six hours without reaching the limit.
- Before launch, tell the user that a long run shares the usage limit with their other sessions.

Each Blender job wants the whole GPU, and the screenshot checks need GPU time too. Split the workers into lanes: at most two lanes run Blender-heavy concepts, and the rest run three.js concepts. Each lane builds its demos one after another.

With a workflow tool, give each builder a structured result schema: `index`, `slug`, `title`, `tech`, `url`, `status` (`published` or `failed`), `summary`, `verification` and `notes`.

A demo takes about 1.5 hours: about an hour to build (30–105 minutes), 10 minutes for the critic, and 20 minutes for the fix. Five workers finish about 3 demos per hour.

## 4. Halt on empty results

When the usage limit hits, every agent call returns nothing. In the second run, the pool then marked all 83 queued demos "failed" within seconds, and each one got a useless retry. Wrap `agent()` so that two empty results in a row stop the pool:

```js
let halted = false, emptyStreak = 0
const call = async (prompt, opts) => {
  if (halted) return null
  const r = await agent(prompt, opts)
  if (r == null) { if (++emptyStreak >= 2) halted = true; return null }
  emptyStreak = 0
  return r
}
```

Workers check `halted` before they take the next item. The script returns the unfinished items, so a relaunch after the reset starts from them. Never auto-retry an empty result.

## 5. Add a critic and a fix pass

A builder's own look passes are not enough. In the second run, the first reviews averaged 6.5/10 for photorealism and 8.2/10 for interactivity, and most demos needed a fix pass. Run three stages for each demo:

1. **Build.** The builder publishes, then writes `NOTES.md` in its folder: the artifact URL, the debug handle, how to drive each control from JS, and known weaknesses.
2. **Critic.** A separate agent reviews the published page. It does not edit files. It takes fresh desktop and phone screenshots, uses every control, and returns `photo` (0–10: can a viewer mistake the frame for a photograph?), `interact` (0–10: three or more controls, one direct gesture in the scene, immediate response, real units, working touch), `blocking` issues and ranked `fixes`.
3. **Fix.** Run a fix pass when either score is below 8 or anything blocks: a page error, a blank frame, a broken control, phone overflow or white-out. The fixer works from the critique and `NOTES.md`, and republishes to the same URL (refer to [publishing.md](publishing.md)).

Add each finding that repeats to a "Lessons from the critic" list in the brief, so later builders avoid it. [quality-bar.md](quality-bar.md) lists the findings from the second run.

## 6. Keep the machine awake

A background run does not stop the OS from sleeping. When the machine sleeps, builders' requests stall, get interrupted, and restart from scratch.

- **macOS:** keep it on AC power with the lid open, and run `caffeinate -dimsu` for the length of the run. On battery, `-s` is ignored.
- **Linux:** `systemd-inhibit --what=sleep:idle <command>`.
- **Windows:** `powercfg /change standby-timeout-ac 0` for the length of the run, then restore it.

Check the power state before launching, and release the keep-awake lock when the run ends.

## 7. Keep the disk clear

Parallel builders fill the disk and the swap. In the second run, macOS swap grew to about 17 GB.

- In the brief, tell builders to delete each EXR, `.blend` save and bake cache as soon as it is encoded. Each builder must leave less than 300 MB in its scratch directory.
- Start a cleanup job with the run. Every 15 minutes, it deletes a demo's scratch directory when no file in it or in the demo's folder changed for 90 minutes. This catches the directories that builders did not clean up.
- Stop the run if free space drops below about 10 GB.

## 8. Check the first result before trusting the rest

When the first demo lands, screenshot it yourself and critique it. A problem in the brief repeats in every later builder, so fix the brief before the others reach that step. Watch for these as well:

- **Restarts:** the same demo starting twice usually means the machine slept.
- **Failures:** read the builder's notes, fix the cause in the brief, then retry.

## 9. Stopping gracefully

To stop after the demos in progress, add a notice at the top of the brief. It lists the demo numbers that may finish, and tells every other builder to return `failed` with "skipped" right away, without creating files.

The notice alone does not stop a workflow that retries failures automatically. In the second run, the retry prompt said "an earlier attempt failed… continue from what works", so the retry builders built anyway: one more demo published, and two more started. Never auto-retry a result that says "skipped". Let the listed demos finish, then stop the workflow itself (in Claude Code, `TaskStop`). Remove the notice afterwards, or the next run skips everything.

## 10. Finish

Update the concept list and the gallery (see [publishing.md](publishing.md)). Report a table of the new demos with their links and any failures with their reasons.
