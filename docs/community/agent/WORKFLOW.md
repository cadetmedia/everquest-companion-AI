# Agent workflow notes

Operational facts for agents working in this clone. Terse on purpose. RULES.md holds the rules;
this file holds the how, the traps, and the owner rulings that are not rules. Where they
disagree, RULES.md wins; fix this file.

## Environment

- **Node 24 only.** Under Node 22, tsx loads the ESM graph twice: `installSpellDb` writes one copy
  of `src/main/log/rulesets.ts` while the parser reads the other, giving ~252 false failures in
  every spell-DB test. CI pins `node-version: 24`. Never "fix" those tests. With nvm-windows,
  `nvm use` does not carry into a tool call: put the v24 directory first on `PATH` or call its
  `node.exe` directly.
- **`ELECTRON_RUN_AS_NODE` must be unset** for e2e and `npm run dev`. Shells spawned by a VS Code
  extension inherit `ELECTRON_RUN_AS_NODE=1`; Electron then runs as plain Node (`electron.app`
  undefined, "Process failed to launch!", or `Cannot read properties of undefined (reading
  'isPackaged')` from `unreleased.ts`). Bash: `unset ELECTRON_RUN_AS_NODE`. PowerShell:
  `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue`.
- **Clear dev caches before `npm run dev`:** `rm -rf node_modules/.vite
  "$APPDATA/everquest-companion-dev/Cache" "$APPDATA/everquest-companion-dev/Code Cache"`. A stale
  vite pre-bundle once made title-bar clicks, overlay checkboxes and the character picker
  silently do nothing with identical code (2026-08-25). If clicks do nothing and the renderer
  logs no error, suspect this first.
- **cargo** lives at `$USERPROFILE/.cargo/bin`. In a fresh worktree set
  `CARGO_TARGET_DIR=<another worktree>/engine/target` to reuse a warm build; delete a scratch
  target dir when done (RULES.md rule 18).
- **Engine rebuild after merging engine changes:** `npm run build:engine` in the main clone. The
  dev app resolves `engine/target/release`, and runs a COPY at
  `%APPDATA%/everquest-companion-dev/engine-run/engined.exe`, so an open app never blocks a rebuild.
- **The user's game log** is `<EQ install>/Logs/eqlog_<Character>_<server>.txt`. The install path
  is recorded in `%APPDATA%/everquest-companion-dev/everquest-companion-progress.json`; read it
  there instead of scanning drives (a drive-wide `find` times out).
- **No prettier.** The repo has no prettier config; `npx prettier --write` reflows whole files to
  defaults. Never run it.

## The user's machine

- Never stop, kill or close the user's processes (game, the installed app, the dev app they are
  using) without asking. If a build target is locked, build to a fresh output dir
  (`npx electron-builder --win --dir -c.directories.output=release/dev`) and say where it is.
- Stopping a dev app the agent itself launched: stopping the shell task can leave the
  `electron-vite dev --watch` node process alive (README.md, "Merge while the dev app is up").
  Stop that node PID; its Electron exits with it. The single-instance lock means an old instance
  must be gone before a relaunch.

## Branch work

- **The model** (owner, 2026-10-26; RULES.md rules 1 to 3): `main_community` is the trunk. A change
  is made on a short-lived work branch in a temporary worktree off `main_community`, gated, merged
  back, and the worktree and branch removed. The per-feature branches, `catch_all` and the
  never-closing branches are retired: never commit to them, never merge them. Related fixes may
  share one work branch; one commit per fix keeps the history readable.
- **Worktrees:** `git worktree add -b <name> .claude/worktrees/<name> main_community` (or under the
  session's temp directory for a short job). Give it a `node_modules` junction to the main clone so
  tsc/eslint/tests run in place. Make the junction with PowerShell
  `New-Item -ItemType Junction -Path <wt>\node_modules -Target <clone>\node_modules` (Git Bash
  `mklink` mangles paths). Without it, a gate grep can false-pass: npm's tool-not-found text
  contains no "error". Check real exit codes.
- **Stage your own files by name in a shared worktree.** Several sessions may write to one tree at
  once (the owner often has a second agent drafting a plan). `git add docs/community` sweeps their
  uncommitted drafts into your commit (2026-10-20: a screenshot-to-wiki plan went out under a
  requirements commit). `git add <path>` each file you changed, and read `git status` before
  committing.
- **Conflicts are resolved on the work branch, never in the main clone.** A merge into the main
  clone that stops on a conflict leaves conflict markers under `src/`, the dev app's `--watch`
  rebuilds them, and the app crashes on the owner (2026-10-11). When `main_community` has moved
  since the work branch was made, merge `main_community` into the work branch in its worktree,
  resolve there and gate; the merge into `main_community` is then clean.
- **Merge from the main tree, never from inside a worktree.** `cd <worktree> && git commit && git
  merge X` merges in the worktree. Run the merge into `main_community` as its own command in the
  main clone.
- **Check `main_community` before starting.** Several agent sessions may merge in the same hour:
  `git log` first, and branch from the current tip.
- **Parallel tool calls share one cwd.** Two parallel commands that `cd` into different worktrees
  can commit into the wrong tree. Run worktree commits sequentially.
- **tsbuildinfo churn:** typecheck rewrites `tsconfig.*.tsbuildinfo`. Restore before committing or
  merging: `git checkout -- tsconfig.node.tsbuildinfo tsconfig.web.tsbuildinfo` (and `git clean
  -fq tsconfig.*.tsbuildinfo` for untracked ones). On a merge conflict in them, take `--theirs`.
  `git add -A` in a worktree picks them up.
- **Never `git add -A` a half-resolved merge.** A file with conflict markers was committed that
  way once (2026-09-12).
- **Never `--amend` a commit `main_community` already has** (re-merge conflicts). Rewrite an
  unpushed, unmerged commit only.
- **Protocol files:** on a merge, regenerate with `npm run gen:protocol`; never hand-merge them. A
  schema field means: edit `protocol/schema/messages.schema.json`, `npm run gen:protocol` (needs
  cargo), update `protocol/fixtures/*.json` and `engine/crates/engined/tests/harness/mod.rs`,
  commit together.
- **`dataWeight.generated.json` regens are timing noise** unless data bytes changed; do not commit
  one alone.
- **One copy of each file.** Before 2026-10-26 a file two branches needed was kept byte-identical
  on both; on the trunk each file exists once, and nothing is kept in step by hand any more.

## Gate

- **Make all the changes, then gate once** (owner, 2026-10-21: "why run it on every change, make
  all the changes, run it once"). While fixing, run only the focused test files for what changed;
  the full gate runs once per work branch at the end, and the merged check once. Parallel agents share
  the machine, so repeated full runs slow every one of them. Helper agents run only their focused
  tests and hand back commits; the coordinating session runs the one full gate and the app check over
  everything at the end (owner, 2026-10-23: "test at the end so we don't waste time waiting for
  agents to test").
- `npm run typecheck`, then restore tsbuildinfo; `rm -rf node_modules/.cache/eslint && npm run
  lint`; `npm test` (Node 24). On `main_community` use `bash scripts/community/known-reds.sh`
  (the unit suite where only names in `scripts/community/known-reds.txt` may fail).
  The gate script runs the tests ONLY: a change that fails `tsc` can pass it (2026-10-11, a
  class-rename fold typed as the rename's value). Typecheck and lint the work branch too,
  every time, before merging into `main_community`.
- **The npm gate does not run the Rust suite.** For an engine change, and before a push, also run `cargo test --workspace` in
  `engine/` on the merged tree (`CARGO_TARGET_DIR` = the main clone's `engine/target` reuses its
  build). 2026-10-13 it found two reds the npm gate had passed for days: the module snapshot test
  (gaps-tab) and the pinned spell-category counts (catch_all x local-data-refresh).
- **A shared `engine/target` remembers another checkout's paths.** Protocol tests built by a session
  whose checkout was later removed fail with `<that scratchpad>/protocol/fixtures: cannot find the
  path`. `cargo clean -p protocol -p protocol-codegen`, then re-run (2026-10-13).
- Count node:test output with `grep -E "ℹ (tests|pass|fail)"`; failures are `^✖` lines. The pass
  count can wobble by one between runs with the same fail set (a skipping test).
- Do not run `npm test` while `npm run dist` rebuilds `out/`: symbolicate's round-trip test scans
  `out/renderer/assets` and goes red for that alone.
- **Size ceilings, with headroom** (owner, 2026-10-17: "400 is NOT that huge for a class with
  comments"; a hard count was driving splits and comment cuts that bought nothing): 440 code lines
  per file, 110 per function, complexity 13, max-params 4, max-depth 3 (`eslint.config.mjs`
  FACTORING_RULES). Comments and blanks never count, so never trim prose to fit.
  Split only where the code has a real seam; do not invent files, classes or methods to dodge a
  count. `preload/index.ts`: a new bridge method needs its own slice file plus a listing in
  `tsconfig.web.json`, inserted mid-list.
- **Engine factoring register** (`engine/factoring-baseline.json`): each recorded value is a
  ceiling with 10% headroom; a recorded file or function may grow until it passes that, a new one
  must stay under the bars above. A shrink stays green and needs no `--write`; the register is
  never rewritten smaller as a chore.
- **`eqc/no-domain-munging` lint rule** forbids filter/sort over shared types inside the renderer;
  such logic lives in `src/shared/`.
- **Test imports:** tests import renderer code by relative path for values (`@shared` resolves for
  types only under tsx). A plain `C:/` path fails under ESM in an ad-hoc script; use `file:///`.
- **Known unit flake:** `presenceWorker.test.mts` "THE WATCHER LOOKS AT THE WORLD ON ITS FIRST TICK"
  can fail under the full suite's load (2026-10-13) and passes alone; re-run before treating it as red.
- **Known engine flake:** `engined` `tests/combat.rs` live-meter tests (4 of 11) fail when `cargo test`
  runs alongside the unit suite (2026-10-28) and pass alone (`cargo test -p engined --test combat`);
  run cargo test on its own before treating them as red.
- **Known e2e reds/flakes:** `respawn-timers.e2e.mts` fails one step ("never claims the mob is
  standing there") on plain upstream main since 2026-08-17. `maps.e2e`, `engine-boots`,
  `engine-absent`, `sky-achievements`, `sky-reward-inference` can flake under parallel load; run
  serially. `feedback.e2e.mts` is red on the TEST build by design (the TEST build disables the
  feedback controls).
  Measured 2026-10-18 (full run on main_community, then serial, then the same specs on test.26):
  58/68 green; the 10 reds were identical on test.26. By design on the TEST build: `feedback`,
  `telemetry` (no analytics compiled in), `spells-gate` (UNRELEASED forced open). Fixed that night
  (stale specs): `default-sound-pack`, `sky-recent-sort`, `plan`. Since 2026-10-18 the
  TEST-build three are skipped by the TEST build's e2e runner with the reason, and `overview`,
  `whats-new` (TEST build) and `voice-alerts` pass. `maps` was red until 2026-10-27: a real
  layout shift (the travel card above the row arriving late), fixed in the app, not the spec. Baseline a red against the last release tag before calling it a regression.
  Measured 2026-10-21 (main_community 4f9062d8 vs test.29, 4 in parallel): 61/65 green on both, no
  new reds. `voice-alerts` is red again on both (the telemetry notice covers the "custom" menu item
  in `customPhraseSteps.mts` `rewordFromTheRow`; the spec never dismisses it, as alert-dialog-focus
  does). `alert-dialog-focus`, `engine-boots` and `engine-absent` flake in parallel and pass alone
  (no `wmic` on this machine: `engineTable()` falls back to `tasklist`, and engines from specs
  running alongside count as new). Each worktree builds its own `engined.exe`: the engine embeds the
  data files, so a shared binary cannot serve two trees.
- **Headless look at an UNRELEASED tab:** temporarily set `UNRELEASED = true as boolean` in
  `devFlags.ts`, `electron-vite build --outDir=<worktree>/out-e2e`, `git checkout` the flag file,
  then a throwaway spec with `launchOnFixture(..., { env: { EQ_UNRELEASED: '1' } })`.
  `--mode development` does not flip `import.meta.env.DEV`. `page.screenshot` can hang on the
  hidden E2E window; `page.context().newCDPSession(page)` + `Page.captureScreenshot` worked once
  but hung on every try on 2026-10-26: read text instead, or bound the call with a timeout.

## Pushing

- Push to `origin` only. Finished, gated work is pushed once it is merged into `main_community`
  and the owner has tested it in the app; then push `main_community` without asking. Before the
  owner has tested, do not push. Work branches are deleted after the merge, not pushed.
- Retired branches are never pushed again; the ones with an open upstream PR stay as they are.

## Owner rulings that shape work

- **No unreleased tabs** (owner, 2026-10-28: "no reason to hide them ever just always show the
  tabs"). `UNRELEASED` is pinned true in both halves (`src/main/unreleased.ts`,
  `src/renderer/src/devFlags.ts`); a new surface ships visible, not behind the gate.

- **The fork has taken over the project** (owner, 2026-09-28). A decision that used to wait on the
  creator (a new tab, a new data file, a departure from AGENTS.md design) is the owner's alone; do
  not park work on the creator's sign-off. The fork's own rules still bind, his code conventions
  are still followed (lint ceilings, tests, house style) so his later `main` still merges, and
  `AGENTS.md` / `releaseNotes.ts` stay hands-off unless the owner says otherwise.
- **One trunk, to move faster** (owner, 2026-10-26: the creator "may never come back, there are
  already multiple competing tools ... we need to be able to move faster and pivot easier").
  Upstream pull requests are no longer a goal, so a change is shaped for the fork, not for
  separability; RULES.md rules 1 to 4 and 9.
- **Wiki and network:** no new runtime fetches. Data comes from committed files and bundled
  assets. Any new scrape is an owner decision, in bulk, at 1 request per second.
  The app reads the wiki only on a Copy click (owner, 2026-10-26: "the app should not be hitting
  the WIKI ever except (delta refresh before build, user clicks COPY on an item and it does the
  lookup)"): `lookupItem`/`lookupMob` are local-only, `lookupItemOnCopy`/`lookupMobOnCopy` and the
  quest Copy are the only doors, `tests/wikiTraffic.test.mts` pins it (wiki-usage/README.md lists
  the touch points).
  Development, testing and validation send the wiki zero requests (owner, 2026-10-10): work from
  fixtures and the committed caches, and a scraper's `--dry-run` that reads the wiki counts as
  a request. Scraper changes keep real runs light: revid checks so only changed pages are
  fetched, 50 pages per request, no retries on permanent errors.
  TRAP (2026-10-10, ~46 requests sent): `git checkout <branch> -- <file>` into a scratch tree takes
  the branch's COMMITTED file, not a worktree's uncommitted edit; a scraper copied that way had no
  `--offline` flag and ran its revision check. Copy from the worktree path, and before running any
  scraper check the flag is in the file you are about to run (`grep -c offline`).
  A wiki read by hand, for any reason, goes through `npx tsx scripts/wiki-call.mts --reason "<why>"
  action=...`, never curl or WebFetch: it is
  counted in `docs/community/wiki-usage/ledger.jsonl` and names the fork (owner, 2026-10-23: "he
  doesn't care for what reason we hit the EQLWiki, so i want to track it all"). Commit its line.
- **Screen text is short** (owner, 2026-10-21: "Do we really need them to checkout a book from the
  library to understand the drop down? ... a single 7-15 word sentence"; "we just hit them with so
  much text to read"). A tooltip is one sentence of 7-15 words; a caption or status line says the one
  thing the player acts on, in a few words, with detail behind a tooltip or an info icon. A tooltip
  never covers the control it explains (a picker's tooltip hides while its menu is open).
- **Wiki edits: what the player meets, never cleanup for its own sake** (owner, 2026-10-21: "we are
  not wiki admins, lets focus on things we notice while playing, and not as much on 100% cleanup,
  but we should always leave a wiki page better than we found it, as long as we aren't editing it
  for formatting sake alone"). The app suggests an edit only for what the player's log shows a page
  lacks; a formatting change (group lines, layout) rides along with a real change, never alone; no
  wiki-wide cleanup lists or bot requests.
- **Scraping is wiki-only; the log is the truth** (owner, 2026-10-10). The game's own files may
  be parsed once, at dev time, to find wiki errors; nothing shipped or scraped depends on them.
  DATA_REFRESH.md, "The ETL".
- **Scraper code and the data it produces** (owner, 2026-10-10): a parser fix and the re-derived
  data it produces may share a work branch, but are separate commits, so the data commit can cite
  its `data-diff`. The test pins a data change moves go in the same work branch.
  `dataWeight.generated.json` is measured after the data lands and committed with it. (Until
  2026-10-26 the code lived on `wiki-scraper-fixes` and the data on `local-data-refresh`.)
- **Diffs:** surgical. Smallest mergeable change; never reformat, rename or restructure beyond
  the feature. New code gets lean comments: a one-line note for a real constraint, not an essay,
  even where legacy files carry long headers.
- **Never write to the creator's spaces** (his Linear board, his data pipelines, his
  telemetry/Lambda deploys). Hand the owner a text brief instead.
- **Feature alerts use the alert framework:** add an `AppSignal`, declare its tokens in
  `APP_SIGNAL_CAPTURES` (`src/shared/alertCaptures.ts`), seed an AlertDef (own module with a
  one-time stamp, e.g. `src/main/alertBazaarSeed.ts`, because `store.ts` is at its ceiling), fire
  with `fireAppSignal(signal, context, captures)`. Never call `showAlertBanner` or `speak` from a
  feature. The feature's own controls decide only what counts as a match.
- **Wiki tokens are case-insensitive.** `LEGS` = `legs` = `Legs`. When a census test fails on a
  case or trailing-punctuation variant, fold it in the test the way `cleanToken`
  (`src/shared/planner/normalize.ts`) folds. Never report a case variant as a wiki error. A
  genuinely different spelling (`SHA` for `SHM`) is a wiki typo.
- **Summoned pets are not auto-bound** (owner, 2026-10-09). A pet counts only after a Master tell,
  `/pet leader`, or a pet-buff landing. Do not re-propose a guessing rule, even a measured one.
- **Code signing is shelved** (owner, 2026-10-07): builds ship unsigned; paid signing is not
  wanted for a free project. Suggesting it again later is fine. The build still supports it
  (`scripts/azure-sign.cjs`, `AZURE_*` secrets, `win.signtoolOptions.publisherName`).
- **Ledgers and commit messages are public.** Record rulings as decision + reason in neutral
  words; never paste casual chat; findings describe code, not authors (RULES.md rule 5).
- **Ask concrete questions with a default**, not overviews of phase numbers.
- **A remark is not an answer.** A reply to a question that comments on it ("that's silly") rather
  than picking an option is not approval; ask what they want instead of acting (owner, 2026-10-17).

## Release notes (the `Test build 0.1.0-test.N:` commit body)

- Only what changed since the previous version, then known issues. The cumulative "what this
  build adds" list lives once, on the test.20 release; `publish-release.sh` links to it and refuses
  a later version that repeats the `WHAT THIS BUILD ADDS` heading.
- State a fix's real scope. Name visible fixes plainly with where they apply ("a few zones:
  Crushbone, Mistmoore, Cabilis listed no mobs"). Fold load-order races and rare edge cases into
  one line ("steadier when things load slowly or happen at once"). Never phrase an edge-case fix
  as if the feature was broken for everyone ("shows icons again").
- Put a blank line after the commit subject, or the body merges into the title.
- Older notes: every `Test build` commit from test.13 on is in `main_community`'s history
  (`git log --grep="^Test build" main_community`; test.13 to test.34 were made on the retired
  `test-neutering`); test.1 to test.12 are under tag `archive/local_all_changes_testing-2026-09-15`.

## Packaged builds

- `npm run dist` only in the main clone (RULES.md rule 16). The running dev app does not block it.
- Verify the asar before handing a build out: every `dependencies` package must be present
  (`publish-release.sh` checks this). Run `npx @electron/asar` from a scratch directory:
  `extract-file <asar> package.json` writes into the cwd and once overwrote the repo's
  `package.json`.
- No finished work branch may be left unmerged before a build (a posky rescrape was once left
  out); the check is step 1.2 of the `community-release` skill.
- The window hides to the tray on close; applying a downloaded update needs tray Quit.
- Launching the packaged app with the repo as cwd makes it use `engine/target/release` (the
  creator's candidate order): a launch artifact, not a player issue.

## Agent tooling traps (Claude Code on Windows)

- **Never commit in a worktree of a retired branch.** `git branch --show-current` before the first
  commit in any worktree; a retired branch carries `RETIRED.md` at its root.

- Bash heredocs and inline commands lose backslashes (`\b` became a backspace byte, `\s` became
  `s`). Write regex-bearing code with the Write/Edit tools or a script file.
- An Edit-tool `replace_all` whose new string ends in a space dropped that space once; use sed for
  trailing-space replacements.
- Worktree files are CRLF on disk (`core.autocrlf=true`); exact-string patchers must normalize.
  Python rewrites CRLF to LF unless the file is opened with `newline=''`; a bare `python` may hang
  on the Windows Store stub.
- The auto-mode permission classifier has refused: `Stop-Process` on electron/engined (even
  agent-launched), `tasklist`, `publish-release.sh --publish` run directly, batched merge loops,
  and hand edits to `engine/factoring-baseline.json`. Plan around them; ask the owner.
- Several agent sessions may run on this clone at once. Before a task-specific message to another
  session, confirm which session holds which task.
- Backticks inside a double-quoted bash string are command substitution: a doc line built that way
  lost every `code` name silently (2026-10-18). Write prose with backticks through Write/Edit.
- Scratch worktrees under `%TEMP%` can vanish mid-job (2026-10-18: a scratch tree's node_modules
  junction, then a whole scratch tree, while the drive was nearly full; most likely Windows temp
  cleanup). Check the junction exists before a gate (a missing one fails as `tsc` not recognized),
  and keep long jobs under `.claude/worktrees/`. A junction to `engine/target` is unlinked before
  removal exactly like `node_modules` (RULES.md rule 18).
- A test pinned to a data count goes red at the next data refresh. Prefer a floor, or a fixture
  under `tests/fixtures/`, so the test survives a refresh.

- **A scratch Playwright probe of the e2e app** (`tests/e2e/appWindow.mts` `mainWindow`,
  `logFixture.mts` `stageFixture` + `appendAt` + `launchOnFixture`) is the way to watch a tab
  without a window on the owner's screen. The window is hidden: `requestAnimationFrame` never
  fires (an `evaluate` awaiting it hangs forever), `page.screenshot` times out, and scroll events
  land late (wait ~1.5 s, not 300 ms, before reading a re-windowed list). An UNRELEASED tab
  (Gaps, Factions) needs `env: { EQ_UNRELEASED: '1' }` (the TEST build forces the renderer half
  open). TRAP (2026-10-26, gone the same day): on a real log the app ran its own eqlwiki mob-lookup
  searches (7 in one probe). Since the owner's ruling below, the app reads the wiki only on a Copy
  click; still launch a probe with `NODE_USE_ENV_PROXY=1` and `HTTPS_PROXY=http://127.0.0.1:9`, so
  a Copy clicked in a probe sends the wiki nothing either.

- **`start_companion.ps1 -NoWatch` still hot-reloads the renderer.** It runs `npm start`, which is
  `electron-vite dev`: only main stops relaunching. A merge or checkout in the main clone while the
  owner uses that window swaps the screens under them (2026-10-20). Do the work in worktrees and
  merge into `main_community` only when the owner is not using the dev app, or after telling them.

## Bug hunts that worked

- Read-only hunter agents by area, one independent validator per report (validators refuted
  several claims), then one implementer per worktree, never two in one worktree.
- Measure on the real log before believing a tester's cause; replay with parity
  (MEASURED.md, Analysis methods).
