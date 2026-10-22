# Phase 6: release

Takes the feature out from behind the unreleased gate and offers it upstream. Can follow phase
2, phase 3, or any later point: what is released is whatever has been built.

[Back to the plan](README.md) · Needs: phase 2 at least · Touches the game folder: no

## Steps

### 6.1 Help text

- **Does**: the panel's explanatory text, reviewed for plain words. It says what is kept, what
  is lost (from the README's list), where the archives are, and how to put a log back.
- **Touches**: the panel.
- **After this step**: a player who has never read this plan can use the feature safely.
- **Undo**: revert the commit.

### 6.2 Tester build

- **Does**: a fork test build with the feature visible, following the fork's test build
  procedure. The tester notes ask for three things: the log's size before and after, whether
  any tab showed different numbers after archiving, and anything that was unclear.
- **Touches**: the `test-neutering` branch only, for the version bump and notes.
- **After this step**: testers other than the owner have tried it.
- **Undo**: the next test build.

### 6.3 Open the gate

- **Does**: removes the unreleased gate from the panel. The switch stays off by default, for
  every player, and only the player turns it on.
- **Needs**: the owner's trial (step 3.7) and at least one tester report from step 6.2.
- **Touches**: the panel's gate check.
- **After this step**: the feature is visible in every build of the fork.
- **Undo**: restore the gate check.

### 6.4 Offer it upstream

- **Does**: with the owner's approval, a comment on
  [#37](https://github.com/jmoyers/everquest-companion/issues/37) that describes what was built,
  what was measured, and the two questions that are the creator's to answer: whether the app
  may move the log, and whether merging stored history in the main process fits his design for
  the engine as the single source of state.
- **Pull requests, if he wants them**, are offered in the order of the phases, so that phases 1
  and 2 can be taken without phase 3.
- **Touches**: nothing in the repo until he answers.
- **After this step**: the work is in front of the creator on his terms.
- **Undo**: not applicable.

## When this phase is done

| Question | Answer |
|---|---|
| What changed for players? | The feature is visible without a gate. |
| What is waiting? | The creator's answers on the issue. |
