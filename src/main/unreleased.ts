// ============================================================================
// unreleased.ts — MAIN's half of the "landed on main, not released yet" gate (JOS-45).
// ============================================================================
//
// IT HAS NO TENANT RIGHT NOW, AND THAT IS THE POINT OF KEEPING IT. Its only user was the
// character sheet's IPC handler, from JOS-45 until the owner released that tab in JOS-327 —
// nothing imports this module today. It survives as the MECHANISM rather than as a user of it,
// because the review gate it implements is a standing arrangement (AGENTS.md describes it) and
// the next surface that lands on main before the owner has looked at it should adopt a lock that
// has already been thought through, not invent a second one. Adopting it is two lines: import
// `UNRELEASED` where the handler is registered, and gate the registration on it.
//
// Everything below describes what it DOES when something uses it. Read it as a recipe.
//
// The owner's review gate: a module may land on main before it has been reviewed, PROVIDED a
// packaged user cannot reach it. The renderer half of that promise is a compile-time STRIP
// (`UNRELEASED` in src/renderer/src/devFlags.ts, anchored on `import.meta.env.DEV`) — the
// component tree, the nav row and the route are deleted from `out/renderer` by rollup, so
// there is nothing in a shipped build to un-hide.
//
// This file is the door on the other side. It exists for two reasons:
//
//   1. DEFENCE IN DEPTH. The strip is the guarantee; this is the second lock, so a future
//      surface that forgets the renderer gate still finds no handler behind it. It follows
//      `registerDevTriageIpc`'s predicate exactly (index.ts): `app.isPackaged` is FALSE under
//      the e2e harness (it launches an unpackaged binary against `out-e2e/`), which is the
//      whole reason `E2E` is a separate term.
//
//   2. IT MAKES THE GATE TESTABLE IN BOTH DIRECTIONS. A production-shaped e2e can assert the
//      module is absent — but an absence test also passes when the feature was never wired up
//      at all. `EQ_UNRELEASED=1` forces the main-side door open in any build, so the same spec
//      can launch a second time and watch the SAME channel answer. Absent, then present, on
//      one build: that is a gate, not dead code. `tests/e2e/character-sheet.e2e.mts` was that
//      spec for six days and is now the inverse — the tab must be PRESENT and must work — which
//      is what a graduation looks like from the test suite's side. A future tenant writes the
//      two-launch spec again against its own channel.
//
// The override cannot make a packaged build show the feature: the renderer surface is not in
// those bytes to show. It opens an IPC handler that a shipped renderer has no code to call.

// ALWAYS OPEN (owner, 2026-10-28: "no reason to hide them ever just always show the tabs"). Every
// build shows every surface this gate guarded, the renderer half (`devFlags.ts`) agrees, and the
// old TEST_BUILD / EQ_UNRELEASED / dev-only terms are gone. The gate's call sites are cleanup for a
// later pass; until then each one reads true.

/** Main-side door for surfaces that once waited on the owner's review: always open. */
export const UNRELEASED = true as boolean
