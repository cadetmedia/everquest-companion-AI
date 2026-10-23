---
name: community-release
description: Cut and publish a community build of EQ Legends Companion to the fork's GitHub Releases page (kaltinril/everquest-companion). Use when the owner asks to release, publish, ship, cut a build, make a new version, or tag a community build.
---

# Release a community build

The release is built and published by GitHub Actions (`.github/workflows/community-release.yml`)
when a `community-<version>` tag is pushed on a `main_community` commit. Nothing is built on the
owner's machine. `docs/community/RELEASING.md` is the full procedure and the reasons; this is the
checklist. Every install from test.20 on updates itself from the newest release, so a release
reaches players within hours: only publish what the owner has asked for.

## 0. Two gates before anything (owner, 2026-10-22, after test.31 went out without either)

1. **Only on the owner's explicit word to RELEASE.** "build it", "run it", "load it" or a yes to a
   question about something else is not it. When in doubt, ask in one line: "Publish test.N to the
   testers now (public, every install updates)?" and wait.
2. **A delta scrape first, always** (`docs/community/agent/DATA_REFRESH.md`; data on
   `local-data-refresh`, gated and merged like any branch). A release ships the wiki as it stands
   today, owner's and testers' edits included.

## 1. Before the tag

1. **Read the previous `Test build` notes** (`git log --grep="^Test build 0.1.0-test." -2 test-neutering`):
   they are the release notes players read and the list of what testers caught last time.
2. **Every recipe branch is level with main_community** (the block in `docs/community/BRANCHES.md`):
   `git rev-list --count main_community..<branch>` is 0 for each; merge any that is not.
3. **Bump and write the notes on `test-neutering`**, in its worktree (`.claude/worktrees/test-neutering`):
   `package.json` version `0.1.0-test.N` -> `N+1`, and one commit titled
   `Test build 0.1.0-test.N: <one line>` whose body is the player-facing notes: ONLY what changed
   since the previous version, then the known issues; short. Never repeat the cumulative "what
   this build adds" list: test.20, the first release, carries it, and the script links to it from
   every later release (it stops if the heading reappears). The script takes the NEWEST `Test build <version>:` commit, so a correction is
   a new empty commit (`--allow-empty`), never an amend of a pushed one.
4. **Merge `test-neutering` into `main_community`** from the main tree (`git merge --no-ff --no-edit`).
5. **Gate locally:** `npm run typecheck`, `npm run lint`, `bash scripts/community/known-reds.sh`
   (Node 24). The workflow runs the same, but a red found here costs minutes, not a CI run.
   Restore `tsconfig.*.tsbuildinfo` afterwards.
6. **Push** `main_community`, `test-neutering` and every branch the build touched to `origin`
   (never `upstream`).

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
gh run list --repo kaltinril/everquest-companion --workflow community-release.yml --limit 1
gh run watch <id> --repo kaltinril/everquest-companion --exit-status
gh release view "community-$v" --repo kaltinril/everquest-companion
```

About 25 minutes cold (the engine's release build dominates; the cargo cache shortens later runs).
The release must carry the installer, `test.yml`, the installer's `.blockmap`, `SHA256SUMS.txt`, and
from the second release on the previous release's `.blockmap`; it must be marked Latest.

## 4. If it fails

- **Before "Publish the release":** nothing is public. Fix on the owning branch, merge, push, then
  move the tag only if it was never published: `git push origin :refs/tags/community-$v`,
  `git tag -d community-$v`, tag again, push again.
- **After publishing:** a mistake is fixed by the next version (`test.N+1`), never by replacing an
  asset someone may have downloaded. Deleting a release is the owner's call.
- **`known-reds.sh` stops:** a new failing test is a real regression; a known red that now passes
  means `scripts/community/known-reds.txt` should shrink (on `community_release_rules`).

## 5. After

Tell the owner the release URL (`https://github.com/kaltinril/everquest-companion/releases/latest`)
and the run URL. Update the release memory.

## Fallback: publish from the owner's machine

`npm run dist` in the main clone (never a junctioned worktree), then
`bash scripts/community/publish-release.sh` (dry run) and `--publish`. Same checks, same assets;
use it only when Actions is unavailable.
