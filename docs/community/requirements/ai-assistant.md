# ai-assistant: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the feature;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). The
design is `docs/plans/ai-assistant.md` (from the adopted PR #46); this file is what the cadetmedia
fork's owner asked for on top.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-29 | owner (cadetmedia) | The AI tool lives inside the companion, so the group runs one app instead of two: an overlay toggled like the meters and timers, and an "AI" row in the side menu that opens the tool and its settings. | built (overlay kind `ai`, the `AI` nav group, the AI Assistant tab; adopted from PR #46) |
| 2026-10-29 | owner | The AI overlay opens unlocked so you can type; the lock still gives a read-only answer view. | built (`DEFAULT_OVERLAY_CONFIG.ai` is `locked: false`: it opens interactive, the pin locks it to the last answer) |
| 2026-10-29 | owner | Screen capture into the assistant: a camera button on the overlay; the capture hotkey only while the AI overlay is open, on by default, switchable off in the AI settings. | open (EQAI's capture to port) |
| 2026-10-30 | owner | Answers come from the app's own data first (fewer AI and wiki calls, faster); web search with trusted/close/outside source tags only as the fallback. | open (PR #46 is local-only; EQAI's web search to add as the fallback) |
| 2026-10-30 | owner | Remove PR #46's unused subscription login. | built (`SubscriptionAuth.ts` deleted on adoption) |
| 2026-10-30 | owner | The AI overlay must not crowd the meters. | built (no meter-stack slot; 420x560 at the left edge, vertically centred) |
| 2026-10-30 | owner | Show people a way to install this, like EQAI's installer. | built (front page `.github/README.md`: install, updates, turning on the AI; installers from `community-*` releases on this repo, first one test.39) |
