// forkFeedback.ts — TEST-BUILD NEUTERING (this branch only, never a PR): what the community build
// says where the creator's build offers feedback.
//
// The ingest endpoint is emptied in this build (main/feedback/net.ts): a report sent from here would
// land in the original developer's queue, on his servers, about code he has never seen. So the
// entry points are disabled and say where reports go instead, in one sentence shared by all of them.

/** Where the community build takes reports. Plain text: the external-link allowlist is the creator's. */
export const FORK_ISSUES = 'github.com/cadetmedia/everquest-companion-AI/issues'

/** The note beside every disabled feedback control. */
export const FORK_FEEDBACK_OFF =
  `Feedback is turned off in this community build: reports sent from here would go to the original ` +
  `developer's server, and this build is maintained separately on kaltinril's fork. Please report ` +
  `problems and ideas at ${FORK_ISSUES}.`
