---
name: community-release
description: Cut and publish a community build of EQ Legends Companion to the fork's GitHub Releases page (cadetmedia/everquest-companion-AI). Use when the owner asks to release, publish, ship, cut a build, make a new version, or tag a community build.
---

# Release a community build

The release is built and published by GitHub Actions (`.github/workflows/community-release.yml`)
when a `community-<version>` tag is pushed on a `main_community` commit. Nothing is built on the
owner's machine. `docs/community/RELEASING.md` is the full procedure and the reasons; this is the
checklist. Every install from test.20 on updates itself from the newest release, so a release
reaches players within hours: only publish what the owner has asked for.

## 0. Two gates before anything (owner, 2026-10-22, after test.31 went out without either)

1. **Only on the owner's explicit word to make a GITHUB RELEASE.** "build it", "run it", "load it"
   or a yes to a question about something else is not it. Always say "GitHub release" for this
   (public, every tester's install updates) and "local build" for anything that stays on the
   owner's PC (owner, 2026-10-22: "be specific about releases going forward ... say github
   release"). Ask in one line: "Publish GitHub release Alpha 1.N now (public, every install
   updates)?" and wait.
2. **The GitHub pack compare and a delta scrape first, always, both** (owner, 2026-10-25):
   `npx tsx scripts/eoz-compare.mts`, then the delta (`docs/community/agent/DATA_REFRESH.md`; the
   data committed on a work branch off `main_community`, gated and merged), then `npx tsx scripts/eoz-compare.mts
   --release` (exits 1 while anything is behind). No pack age stands in for the delta. A release ships the wiki as it stands today,
   owner's and testers' edits included.

## 1. Before the tag

1. **Read the previous `Test build` notes** (`git log --grep="^Test build 1.0.0-" -2 main_community`):
   they are the release notes players read and the list of what testers caught last time.
2. **No finished work is left unmerged.** `git worktree list`, and the unmerged branches that are
   not retired (a retired one carries `RETIRED.md`; RULES.md rule 9):
   `for b in $(git branch --no-merged main_community --format='%(refname:short)'); do git cat-file -e "$b:RETIRED.md" 2>/dev/null || echo "$b"; done`.
   A finished, gated work branch that is not in yet is merged first, or the owner is told why not.
3. **Bump and write the notes on a work branch** off `main_community`, in a temporary worktree
   (`git worktree add -b release-alpha-1.N .claude/worktrees/release-alpha-1.N main_community`):
   `package.json` version `1.0.0-alpha.N` -> `N+1` (cadetmedia fork, 2026-10-30: EQAI's numbering,
   shown as "Alpha 1.N"; then `1.0.0-beta.N`, then `1.0.0`), and one commit titled with the NEW version,
   `Test build 1.0.0-alpha.<N+1>: <one line>` (the script looks for the `package.json` version), whose body is the player-facing notes: ONLY what changed
   since the previous version, then the known issues; short. Never repeat the cumulative "what
   this build adds" list: test.20, the first release, carries it, and the script links to it from
   every later release (it stops if the heading reappears). The script takes the NEWEST `Test build <version>:` commit, so a correction is
   a new empty commit (`--allow-empty`), never an amend of a pushed one.
4. **Merge the work branch into `main_community`** from the main tree (`git merge --no-ff --no-edit`),
   then remove the worktree and the branch (RULES.md rule 18).
5. **Gate locally:** `npm run typecheck`, `npm run lint`, `bash scripts/community/known-reds.sh`
   (Node 24). The workflow runs the same, but a red found here costs minutes, not a CI run.
   Restore `tsconfig.*.tsbuildinfo` afterwards.
6. **Push** `main_community` to `origin` (never `upstream`).

## 2. The tag

```
v=$(node -p "require('./package.json').version")
git tag "community-$v" main_community
git push origin "community-$v"
```

The tag must be exactly `community-<package.json version>`; the workflow stops otherwise. Never a
`v*` tag: that starts the creator's release job in `build.yml`.

## 3. Watch it

```
gh run list --repo cadetmedia/everquest-companion-AI --workflow community-release.yml --limit 1
gh run watch <id> --repo cadetmedia/everquest-companion-AI --exit-status
gh release view "community-$v" --repo cadetmedia/everquest-companion-AI
```

About 25 minutes cold (the engine's release build dominates; the cargo cache shortens later runs).
The release must carry the installer, `test.yml`, the installer's `.blockmap`, `SHA256SUMS.txt`, and
from the second release on the previous release's `.blockmap`; it must be marked Latest.

## 4. If it fails

- **Before "Publish the release":** nothing is public. Fix on a work branch, merge, push, then
  move the tag only if it was never published: `git push origin :refs/tags/community-$v`,
  `git tag -d community-$v`, tag again, push again.
- **After publishing:** a mistake is fixed by the next version (`1.0.0-alpha.N+1`), never by replacing an
  asset someone may have downloaded. Deleting a release is the owner's call.
- **`known-reds.sh` stops:** a new failing test is a real regression; a known red that now passes
  means `scripts/community/known-reds.txt` should shrink (a work branch off `main_community`).

## 5. After

Tell the owner the release URL (`https://github.com/cadetmedia/everquest-companion-AI/releases/latest`)
and the run URL. Update the release memory.

## Fallback: publish from the owner's machine

`npm run dist` in the main clone (never a junctioned worktree), then
`bash scripts/community/publish-release.sh` (dry run) and `--publish`. Same checks, same assets;
use it only when Actions is unavailable.
