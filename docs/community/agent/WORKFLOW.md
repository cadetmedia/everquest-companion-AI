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

- **Where a fix goes:** the feature branch that owns the code. A small fix to the creator's code
  that no feature branch of ours owns goes on `catch_all` (never-closing, in the recipe), one
  commit per fix so each can become its own upstream PR. Never make a dated or per-fix branch.
  Add a sentence to `catch_all`'s BRANCHES.md row per fix.
- **Worktrees:** `git worktree add .claude/worktrees/<branch> <branch>`. Give it a
  `node_modules` junction to the main clone so tsc/eslint/tests run in place. Make the junction
  with PowerShell `New-Item -ItemType Junction -Path <wt>\node_modules -Target <clone>\node_modules`
  (Git Bash `mklink` mangles paths). Without it, a gate grep can false-pass: npm's
  tool-not-found text contains no "error". Check real exit codes.
- **Merge into the scratch tree first, every time.** A merge into the main clone that stops on a
  conflict leaves conflict markers under `src/`, the dev app's `--watch` rebuilds them, and the
  app crashes on the owner (2026-10-11: two conflicts in a branch merged straight into
  `main_community`). Merge into the detached scratch copy, resolve there, gate, then merge the
  same branches into `main_community`; `rerere` replays the recorded resolution.
- **Merge from the main tree, never from inside a worktree.** `cd <worktree> && git commit && git
  merge X` merges in the worktree. Run merges into `main_community` as separate commands in the
  main clone, a few at a time; do not batch ~20 merges in one loop.
- **Parallel tool calls share one cwd.** Two parallel commands that `cd` into different worktrees
  can commit into the wrong tree. Run worktree commits sequentially.
- **tsbuildinfo churn:** typecheck rewrites `tsconfig.*.tsbuildinfo`. Restore before committing or
  merging: `git checkout -- tsconfig.node.tsbuildinfo tsconfig.web.tsbuildinfo` (and `git clean
  -fq tsconfig.*.tsbuildinfo` for untracked ones). On a merge conflict in them, take `--theirs`.
  `git add -A` in a worktree picks them up.
- **Never `git add -A` a half-resolved merge.** A file with conflict markers was committed that
  way once (2026-09-12).
- **Never `--amend` a commit `main_community` already merged** (re-merge conflicts). Rewrite an
  unpushed, unmerged commit only.
- **Protocol files:** on a merge, regenerate with `npm run gen:protocol`; never hand-merge them. A
  schema field means: edit `protocol/schema/messages.schema.json`, `npm run gen:protocol` (needs
  cargo), update `protocol/fixtures/*.json` and `engine/crates/engined/tests/harness/mod.rs`,
  commit together.
- **`dataWeight.generated.json` regens are timing noise** unless data bytes changed; do not commit
  one alone.
- **Check shared branches before editing them.** Several agent sessions may commit to
  `main_community_rules` or a feature branch in the same hour: `git log` first.
- **Shared code across branches:** a file two branches both need is kept byte-identical on both
  (`git checkout <a> -- <file>`, then `git diff <a> <b> -- <file>` is empty), so whichever merges
  first, the other dedupes. Current pairs: `src/shared/planner/roleWeights.ts` on
  gear-progression-plan (home) and gear-tab-improvements; `src/renderer/src/appRouting.ts` on
  gear-tab-improvements, map-improvements, gear-progression-plan; `src/renderer/src/lib/CellLink.tsx`
  on gear-tab-improvements and gear-progression-plan; `src/shared/factionLedger.ts` + its test on
  log-archive and faction-tab. Verify pairs with `git merge-tree --write-tree <a> <b>`.
- **Branches with two UNRELEASED splices** in `appViews.ts`: `tests/telemetryContract.test.mts`
  on main reads only the first; take spell-upgrades' version of that test.

## Gate

- `npm run typecheck`, then restore tsbuildinfo; `rm -rf node_modules/.cache/eslint && npm run
  lint`; `npm test` (Node 24). On `main_community` use `bash scripts/community/known-reds.sh`
  (the unit suite where only names in `scripts/community/known-reds.txt` may fail).
  The gate script runs the tests ONLY: a change that fails `tsc` can pass it (2026-10-11, a
  class-rename fold typed as the rename's value). Typecheck and lint the scratch merge too,
  every time, before merging into `main_community`.
- **The npm gate does not run the Rust suite.** Before a push, also run `cargo test --workspace` in
  `engine/` on the merged tree (`CARGO_TARGET_DIR` = the main clone's `engine/target` reuses its
  build). 2026-10-13 it found two reds the npm gate had passed for days: the module snapshot test
  (gaps-tab) and the pinned spell-category counts (catch_all x local-data-refresh).
- **A shared `engine/target` remembers another checkout's paths.** Protocol tests built by a session
  whose checkout was later removed fail with `<that scratchpad>\protocolixtures: cannot find the
  path`. `cargo clean -p protocol -p protocol-codegen`, then re-run (2026-10-13).
- Count node:test output with `grep -E "ℹ (tests|pass|fail)"`; failures are `^✖` lines. The pass
  count can wobble by one between runs with the same fail set (a skipping test).
- Do not run `npm test` while `npm run dist` rebuilds `out/`: symbolicate's round-trip test scans
  `out/renderer/assets` and goes red for that alone.
- **Lint ceilings bite, and are split for, never raised:** 100 code lines per function,
  complexity 12, max-params 4, max-depth 3, 400 code lines per file. `max-lines` skips comments,
  so trimming prose buys nothing; split the code. Files at or near 400: `preload/index.ts` (a new
  bridge method needs its own slice file plus a listing in `tsconfig.web.json`, inserted mid-list),
  `ItemWindow.tsx`, `store.ts`, `spellLoadout.ts`, `progressionPlan.ts`, `gear.e2e.mts`.
- **Engine factoring ratchet** (`engine/factoring-baseline.json`): a file over 400 lines may not
  grow at all. New behaviour rides an existing match arm or pays by moving code to a new file;
  `npm run check:rust-factoring -- --write` records a shrink in the SAME commit.
- **`eqc/no-domain-munging` lint rule** forbids filter/sort over shared types inside the renderer;
  such logic lives in `src/shared/`.
- **Test imports:** tests import renderer code by relative path for values (`@shared` resolves for
  types only under tsx). A plain `C:/` path fails under ESM in an ad-hoc script; use `file:///`.
- **Known unit flake:** `presenceWorker.test.mts` "THE WATCHER LOOKS AT THE WORLD ON ITS FIRST TICK"
  can fail under the full suite's load (2026-10-13) and passes alone; re-run before treating it as red.
- **Known e2e reds/flakes:** `respawn-timers.e2e.mts` fails one step ("never claims the mob is
  standing there") on plain upstream main since 2026-08-17. `maps.e2e`, `engine-boots`,
  `engine-absent`, `sky-achievements`, `sky-reward-inference` can flake under parallel load; run
  serially. `feedback.e2e.mts` is red on the TEST build by design (test-neutering disables the
  feedback controls).
- **Headless look at an UNRELEASED tab:** temporarily set `UNRELEASED = true as boolean` in
  `devFlags.ts`, `electron-vite build --outDir=<worktree>/out-e2e`, `git checkout` the flag file,
  then a throwaway spec with `launchOnFixture(..., { env: { EQ_UNRELEASED: '1' } })`.
  `--mode development` does not flip `import.meta.env.DEV`. `page.screenshot` can hang on the
  hidden E2E window; `page.context().newCDPSession(page)` + `Page.captureScreenshot` works.

## Pushing

- Push to `origin` only. Finished, gated work is pushed once it is merged into `main_community`
  and the owner has tested it in the app; then push every branch it touched (feature branch,
  `main_community_rules`, `test-neutering`, `main_community`) without asking. Before the owner has
  tested, do not push.
- A branch with an open upstream PR is pushed like any other; the PR updating is fine.

## Owner rulings that shape work

- **The fork has taken over the project** (owner, 2026-09-28). A decision that used to wait on the
  creator (a new tab, a new data file, a departure from AGENTS.md design) is the owner's alone; do
  not park work on the creator's sign-off. The fork's own rules still bind, his code conventions
  are still followed (lint ceilings, tests, house style) so branches stay mergeable, and
  `AGENTS.md` / `releaseNotes.ts` stay hands-off unless the owner says otherwise.
- **Wiki and network:** no new runtime fetches. Data comes from committed files and bundled
  assets. Any new scrape is an owner decision, in bulk, at 1 request per second.
  Development, testing and validation send the wiki zero requests (owner, 2026-10-10): work from
  fixtures and the committed caches, and a scraper's `--dry-run` that reads the wiki counts as
  a request. Scraper changes keep real runs light: revid checks so only changed pages are
  fetched, 50 pages per request, no retries on permanent errors.
  TRAP (2026-10-10, ~46 requests sent): `git checkout <branch> -- <file>` into a scratch tree takes
  the branch's COMMITTED file, not a worktree's uncommitted edit; a scraper copied that way had no
  `--offline` flag and ran its revision check. Copy from the worktree path, and before running any
  scraper check the flag is in the file you are about to run (`grep -c offline`).
- **Scraping is wiki-only; the log is the truth** (owner, 2026-10-10). The game's own files may
  be parsed once, at dev time, to find wiki errors; nothing shipped or scraped depends on them.
  DATA_REFRESH.md, "The ETL".
- **Scraper work lives on two branches** (owner, 2026-10-10): scraper and parser code on
  `wiki-scraper-fixes`, the data it produces on `local-data-refresh`. A parser a feature branch
  owns (`mobFaction.ts` on slayer-tab, `questPage.ts` on faction-tab) is fixed where it lives, so
  no file is shared across branches; a data file likewise (`quests.json` faction-tab,
  `mobFactions.json`/`mobRaces.json` slayer-tab, the rest local-data-refresh). Test pins follow
  the test file's branch. `dataWeight.generated.json` is measured on the merged tree and
  committed on the data branch that merges last.
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

## Release notes (the `Test build 0.1.0-test.N:` commit body)

- Only what changed since the previous version, then known issues. The cumulative "what this
  build adds" list lives once, on the test.20 release; `publish-release.sh` links to it and refuses
  a later version that repeats the `WHAT THIS BUILD ADDS` heading.
- State a fix's real scope. Name visible fixes plainly with where they apply ("a few zones:
  Crushbone, Mistmoore, Cabilis listed no mobs"). Fold load-order races and rare edge cases into
  one line ("steadier when things load slowly or happen at once"). Never phrase an edge-case fix
  as if the feature was broken for everyone ("shows icons again").
- Put a blank line after the commit subject, or the body merges into the title.
- Older notes: test.13 onward are `Test build` commits on `test-neutering`; test.1 to test.12 are
  under tag `archive/local_all_changes_testing-2026-09-15`.

## Packaged builds

- `npm run dist` only in the main clone (RULES.md rule 16). The running dev app does not block it.
- Verify the asar before handing a build out: every `dependencies` package must be present
  (`publish-release.sh` checks this). Run `npx @electron/asar` from a scratch directory:
  `extract-file <asar> package.json` writes into the cwd and once overwrote the repo's
  `package.json`.
- Every recipe branch must be level with `main_community` before a build:
  `git rev-list --count main_community..<branch>` is 0 for each (a posky rescrape was once left
  out).
- The window hides to the tray on close; applying a downloaded update needs tray Quit.
- Launching the packaged app with the repo as cwd makes it use `engine/target/release` (the
  creator's candidate order): a launch artifact, not a player issue.

## Agent tooling traps (Claude Code on Windows)

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

## Bug hunts that worked

- Read-only hunter agents by area, one independent validator per report (validators refuted
  several claims), then one implementer per worktree, never two in one worktree.
- Measure on the real log before believing a tester's cause; replay with parity
  (MEASURED.md, Analysis methods).
