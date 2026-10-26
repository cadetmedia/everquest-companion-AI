# Microsoft Store: free signing by publishing there

**PARKED (owner, 2026-10-08):** kept as research; not started. The GitHub installer comes first.

A plan, in phases, for offering the community build through the Microsoft Store as well as the
fork's GitHub Releases page. Nothing here is built yet. It sits beside
[RELEASING.md](RELEASING.md), because it is about how the build reaches players.

## Where this came from, and whether it is true

A player suggested it: publish on the Microsoft Store and Microsoft signs the app for free, at the
cost of setting up a Partner account, writing the listing, and waiting for each version to be
scanned. Checked on 2026-10-08:

| Claim | Verdict |
|---|---|
| Microsoft signs it for you | **True for an MSIX package.** The Store re-signs an MSIX after certification; there is no certificate to buy or renew, and players see no SmartScreen warning. **Not true for an EXE or MSI**, which the Store only links to and which we would have to sign ourselves with a paid certificate. So this plan means building an MSIX, not submitting today's installer. |
| Setting up the account | **True, and now free for an individual.** Since September 2025 individual registration costs nothing; Microsoft verifies the person with a government ID and a selfie. A company account still costs money. |
| Listing work | **True.** Description, screenshots, an age rating questionnaire, a privacy policy link, and a reason for every restricted capability. |
| Each version is scanned | **True.** Every submission goes through certification, typically hours, sometimes a day or more. The Store channel will trail the GitHub page by that much. |
| Painless install for players | **True.** One click from the Store, no SmartScreen, and the Store keeps it updated. |

Sources:
[code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options),
[free individual registration](https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/),
[choosing a distribution path (MSIX vs MSI/EXE)](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/choose-distribution-path),
[electron-builder AppX target](https://www.electron.build/docs/appx),
[flexible virtualization](https://learn.microsoft.com/en-us/windows/msix/desktop/flexible-virtualization),
[Store policies, section 10.1](https://learn.microsoft.com/windows/uwp/publish/store-policies).

## The rule: one version, one build, every channel (owner, 2026-10-08)

A player must see the same version and get the same app whether it came from the GitHub page or the
Store. So:

- **One commit.** Both packages of a release are built from the same `main_community` commit, in
  the same session. The only differences allowed are packaging and where updates come from.
- **One version number.** Today's `0.1.0-test.N` cannot be written as a Store version (four plain
  numbers, the last reserved as 0), so the scheme moves to plain `0.1.N`: the GitHub build is
  `0.1.N` and the Store build is `0.1.N.0`, the same number in the Store's form. The app shows
  `0.1.N` either way. Semver puts `0.1.21` above `0.1.0-test.20`, so installs already out there
  update to it, and the update file stays `test.yml` because its name is pinned
  (`electron-builder.yml`, checked with a build numbered 0.2.0).
- **Released together.** The GitHub release is published when the Store submission is certified,
  or the GitHub one goes first and the Store one follows within the certification delay; RELEASING.md
  says which (Phase 0 ruling). A Store submission that fails certification is fixed as the next
  version on both channels, never as a Store-only build.
- **Checked by the script.** The publish script refuses to publish when the version is not plain
  `0.1.N`, and records the commit both packages came from.

## What changes for this app (read before Phase 1)

These are the facts that make an MSIX of this app different from the NSIS installer. Each is either
settled by a ruling in Phase 0 or tested in Phase 2.

1. **A third build identity.** The Store package has its own identity (name, publisher) reserved in
   Partner Center. It is a separate app from the GitHub TEST build, as that one is from the official
   app.
2. **Updates come from the Store, never from our feed.** Store apps must be updated by the Store.
   The Store build turns the app's own updater off (Electron sets `process.windowsStore` in an
   AppX/MSIX package, which is the switch). The GitHub build keeps updating itself.
3. **Version numbers.** MSIX versions are four numbers, the fourth reserved by the Store (0), and
   each submission must be higher than the last. electron-builder turns `0.1.0-test.20` into
   `0.1.0.x` for every test build (it drops the `-test` part), which is why the version rule above
   moves both channels to plain `0.1.N`.
4. **Settings live somewhere else.** A packaged app's writes under `%APPDATA%` are virtualized into
   the package's private folder and deleted on uninstall, unlike the NSIS build, which keeps them.
   Two ways out, an owner ruling: accept separate settings (a player moving from the GitHub build
   would start again unless the first-run copy reads the real folder, which needs testing), or
   declare `%APPDATA%\everquest-companion-test` unvirtualized (the `unvirtualizedResources`
   restricted capability, Windows 11 or late Windows 10, another written justification) so both
   builds share one settings folder.
5. **Full trust.** The app spawns its own engine, reads the game's logs under `C:\Users\Public`,
   and moves the log into `Logs\companion-archive`. All of that needs `runFullTrust`, which
   electron-builder always declares; Partner Center asks for a justification in a short text box.
6. **The name.** Store policy 10.1.1 forbids a listing that misleads about its relationship to
   other products or reuses another product's name. "EverQuest" is Daybreak's trademark, and the
   app's name carries "EQ". The listing must say plainly that it is an unofficial fan tool, not
   affiliated with or endorsed by Daybreak, and credit the original author. A rejection on naming
   is possible; the remedy is a clearer title or written permission from Daybreak.
7. **Whose name is on it.** An individual account publishes under the verified person's name, shown
   on the listing as the publisher. That is the owner's call (Phase 0).

## Phases

Every phase ends in a state that can stop: nothing reaches players before Phase 5.

### Phase 0: rulings (owner, no code)

- Publish on the Store at all, alongside the GitHub page (recommended: yes, both).
- Individual account under the owner's name, or a company account (costs money).
- The listing title (a suggestion: "Companion for EQ Legends (unofficial)"), and whether to ask
  Daybreak for permission first.
- Settings: separate per build, or shared through an unvirtualized folder (item 4 above). Shared is
  what "the same app however it was installed" asks for.
- When the version scheme moves to plain `0.1.N`: at the next build (it can be done before the
  Store exists, and nothing has been published yet), or with the first Store release.
- Release order between the two channels.

### Phase 1: account and name (owner, about an hour, no code)

- Register at storedeveloper.microsoft.com with a personal Microsoft account; complete ID and selfie
  verification.
- Reserve the app name in Partner Center.
- Copy the identity values from Product management, Product identity: Package/Identity/Name,
  Package/Identity/Publisher, and PublisherDisplayName. They go into Phase 2's config, exactly.

### Phase 1b: the version scheme (code, small; can land before any Store work)

- **Touches:** `package.json` (version `0.1.N`; the test-build procedure's bump), and
  `scripts/community/publish-release.sh` (it accepts `0.1.N`, finds the `Test build 0.1.N:`
  notes, and refuses a prerelease-shaped version; the tag stays `community-<version>`).
- **Check:** a build numbered `0.1.21` is offered to an installed `0.1.0-test.20` by the local
  feed test used for test.20 (RELEASING.md), and its `test.yml` and installer name carry `0.1.21`.

### Phase 2: a Store build that runs locally (code, about half a day)

- **Touches:** a Store build config beside the TEST one (an `appx` target with
  the Phase 1 identity values and the version mapping of item 3), tile images generated from
  `build/icon.png` into `build/appx/` (Square44x44Logo, Square150x150Logo, StoreLogo,
  Wide310x150Logo; electron-builder does not make them from the .ico), and the updater turned off
  when `process.windowsStore` is true.
- **Same version:** the Store build reads the version from the same `package.json` and writes it as
  `0.1.N.0`; a check in the build fails if the two ever differ.
- **Check, on a Windows machine with Developer Mode and a local test certificate:** it installs,
  launches, finds the logs, starts its engine, reads a dump, archives a log into
  `Logs\companion-archive` and puts it back, and survives an uninstall and reinstall. Record where
  the settings ended up.
- **Undo:** delete the config; nothing else depends on it.

### Phase 3: settings across builds (code, small; depends on the Phase 0 ruling)

- Separate settings: make sure the first-run copy reads the real `%APPDATA%` folders of the TEST and
  official apps from inside the package, and copies them in.
- Shared settings: declare the TEST settings folder unvirtualized and test that both builds read
  and write the same files.

### Phase 4: the listing (owner and agent, a few hours)

- Description and feature list from the release notes, with the unofficial-and-not-affiliated line
  and the original author credited.
- Screenshots of the main tabs.
- A privacy policy page: the app reads the game's local files, sends nothing anywhere (telemetry and
  feedback are off in the community build), and stores everything on the player's machine. It can
  be a page in this repository.
- Age rating questionnaire; category Utilities or Games companion.
- The `runFullTrust` justification (and `unvirtualizedResources`, if ruled): short, it gets cut off.

### Phase 5: first submission (owner clicks submit)

- Upload the MSIX, submit, wait for certification. Answer any rejection (naming is the most likely)
  and resubmit.
- Once live, add a Store step to RELEASING.md: both packages built from the same commit in one
  session, the same version, released in the order Phase 0 ruled. The GitHub page stays the fastest
  channel; it is never ahead by more than the certification delay.

## What it costs and what it does not fix

- Money: none for an individual account. Time: certification on every release, and keeping a second
  build config working.
- It does not sign the GitHub installer. Players who download from GitHub still see SmartScreen
  until the GitHub build is signed some other way (code signing is shelved; see RELEASING.md).
