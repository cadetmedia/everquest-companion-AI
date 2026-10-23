# Releasing a community build

How a TEST build goes from `release/<version>/` on the owner's machine to a download link anyone
can use, on the fork's own Releases page:
<https://github.com/kaltinril/everquest-companion/releases>. This lives on the never-closing
`community_release_rules` branch, with the script it describes (`scripts/community/publish-release.sh`).
That branch holds only these release docs, scripts, the workflow and the release skill, and merges into `main_community` like `main_community_rules`;
the build and the release always come from `main_community`.

## What a community release is

The `0.1.0-test.N` installer that `test-neutering` produces, attached to a GitHub Release on the
fork. Nothing about the build changes for the release; the TEST identity is what makes it safe to
hand to strangers:

- **It installs beside the official app, not over it.** Its own appId, product name, install
  folder and settings (`test-neutering`).
- **It updates itself from this fork's Releases page, and only from it** (since test.20). The TEST
  `electron-builder.yml` on `test-neutering` points the creator's own updater at a generic feed,
  `https://github.com/kaltinril/everquest-companion/releases/latest/download/`, so an install reads
  `test.yml` (electron-builder names the update file after the version's prerelease word) from the
  newest release here, downloads the newer installer quietly and applies it
  when the app closes. Nothing points at the creator's repo, so the official app never replaces a
  TEST install and a TEST release never reaches an official one. The updates are unsigned, which
  is the same trust a manual download from this page has: the fork's GitHub account and HTTPS.
- **Telemetry and feedback are dark**, so nothing it does reaches the creator's servers.
- **It is not code-signed.** Windows SmartScreen says "Windows protected your PC" on first run;
  the player clicks **More info**, then **Run anyway**. The release notes say so.

The app's licence (FSL-1.1-MIT) permits this: redistribution for any purpose other than a
competing commercial product.

## Why the tag is `community-<version>`

A GitHub Release always creates a tag. `.github/workflows/build.yml` runs its `release` job on
any `v*` tag: it builds the OFFICIAL app identity, signs it if signing secrets exist, and publishes
with the creator's `publish` block. A `v0.1.0-test.N` tag on the fork would at best fail and at
worst start an official-looking build. `community-0.1.0-test.N` matches no workflow trigger, so
creating the release runs nothing.

## Procedure

**Two gates come first** (owner, 2026-10-22: "i never told you to release something, we should
ALWAYS do a delta scrape before a release"): a release is cut only on the owner's explicit word to
release, and only after a delta scrape has brought the data up to today's wiki. test.31 went out
without either.

Since 2026-10-08 a release is built and published by GitHub Actions
(`.github/workflows/community-release.yml`) when a `community-<version>` tag is pushed, as the
creator's releases are by `build.yml` on a `v*` tag. Nothing is built on the owner's machine. The
step-by-step checklist is the `community-release` skill (`.claude/skills/community-release/SKILL.md`).

**Pushing branches never releases anything** (owner, 2026-10-08: branches go up between
releases without starting a version). Only the `community-*` tag starts `community-release.yml`;
`build.yml` builds on a push to `main` (a CI check that publishes nothing) and releases only on a
`v*` tag, which the fork never pushes. Feature branches, `main_community` and the rules branches
start no workflow at all, so they are pushed whenever the work is done and tested, and a release is
only ever the deliberate tag in step 4.

1. **Prepare** as for any tester build: read the previous `Test build` commit's notes, check every
   recipe branch is level with `main_community`, bump `package.json` and write the notes as a
   commit on `test-neutering` (they become the release notes, so they are written for players,
   and hold only what changed since the previous version plus the known issues: the full list of
   what the community build adds lives once, on the test.20 release, and every later release links
   to it), merge it, and run the gate (`bash scripts/community/known-reds.sh` is the unit suite with only
   the known reds allowed).
2. **The owner says to release.** A release is public the moment it exists, reaches every install
   from test.20 on within hours, and may be mirrored or indexed, so this is always the owner's word.
3. **Push** `main_community`, `test-neutering` and any branch the build touched to `origin`.
4. **Tag and push the tag:** `git tag community-<version> main_community` and
   `git push origin community-<version>`.
5. **The workflow** checks the tag names the `package.json` version; runs typecheck, lint and the
   unit suite (only the known reds in `scripts/community/known-reds.txt` may fail, by name); builds
   the engine and the unsigned installer on a clean Windows runner; then runs
   `scripts/community/publish-release.sh --publish`, which checks the installer, its `test.yml` and
   `.blockmap`, the asar (every runtime dependency `package.json` declares, and `node_modules/conf`), that the
   tagged commit is on `origin/main_community` and contains the `Test build <version>:` commit, and
   that the tag has no release yet, then creates the release, marked Latest, with the installer,
   `test.yml`, the blockmap, the previous release's blockmap and `SHA256SUMS.txt`.
6. **Share** <https://github.com/kaltinril/everquest-companion/releases/latest>. Each new release
   is marked Latest, so that link always gives the newest build.

**Fallback, when Actions is unavailable:** `npm run dist` in this clone (never a junctioned
worktree, RULES.md rule 16), then `scripts/community/publish-release.sh` as a dry run and again
with `--publish`. Same checks, same assets.

A release with a mistake is corrected by publishing the next test.N, not by replacing an asset
someone may already have downloaded. Deleting a release is the owner's call.

## Not done, and why

- **Code signing: shelved (owner, 2026-10-07)**, because every publicly trusted certificate costs
  money and this is a free project. A free route was suggested since: publish an MSIX on the
  Microsoft Store, which Microsoft signs; the plan is [MS-STORE.md](MS-STORE.md). The build already supports Azure Artifact Signing
  (US$9.99/month, individuals in the US and Canada): `scripts/azure-sign.cjs` signs whenever the
  six `AZURE_*` variables are set, and `win.signtoolOptions.publisherName` must then be the
  certificate's name exactly. Free signing services (SignPath Foundation) require an OSI licence,
  which FSL is not. A new certificate still meets SmartScreen warnings until it builds reputation.
- **Auto-update: on since test.20**, without signing. What it took: the generic `publish` block
  above, `publisherName` dropped from the TEST build (with it every unsigned update is rejected),
  the `TEST_BUILD` early-out in `src/main/updater.ts` removed, and the publish script uploading
  `test.yml` and the installer's `.blockmap` with every release, and the test package renamed
  `everquest-companion-test` so it has its own install folder and updater cache (a one-click
  install is named after the package; before test.20 both apps shared one folder). A release must therefore be
  marked Latest (the script does), and an install older than test.20 never updates: those players
  download once by hand. Each release also carries the previous release's `.blockmap`, so an
  install one version behind downloads only what changed; one further behind gets the whole
  installer.
- **Moving over from older installs (since test.20)**, all checked on the owner's machine:
  - *An older TEST build* (test.19 and before) lived in `%LOCALAPPDATA%\Programs\everquest-companion`,
    the official app's folder. test.20's installer (`build/installer.nsh`, `eqLeaveSharedFolder`
    on `test-neutering`) moves it to `everquest-companion-test`; settings are untouched.
  - *Both apps installed*: the official app's files in the shared folder are left alone; only the
    TEST exes are removed. The TEST settings are kept and win, since they already exist. An
    official app an earlier TEST install had overwritten needs one reinstall from the creator's
    page.
  - *Only the official app*: on first launch the TEST build copies the official app's settings,
    learned messages, resist history, item cache, sound packs and UI choices (`channel.ts`
    `SEED_ENTRIES`); the official app is never changed.
- **The fork's front page** shows the creator's README, because the default branch is `main`
  and `main` is never committed to. Share the Releases link directly.
