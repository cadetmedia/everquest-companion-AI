# Agent index

Agent-facing notes for this fork. Humans read `docs/community/README.md`; agents read that, then
these. Repo knowledge lives here, never only in an agent's private memory: anyone who clones the
repo must get it. When you learn something a later session would need (a procedure, a trap, a
measured fact, an owner ruling), add it to the right file below on `main_community_rules`, merge
into `main_community`, and push with the rest of the work.

| File | Read when |
| --- | --- |
| [../RULES.md](../RULES.md) | Always, first. The binding rules. |
| [WORKFLOW.md](WORKFLOW.md) | Before any branch, merge, gate, build or push. Environment, traps, owner rulings. |
| [BRANCH_NOTES.md](BRANCH_NOTES.md) | Before touching a feature branch. Design laws, traps, open items per branch. |
| [../requirements/](../requirements/) | Before changing a feature. What was asked (rule 19). |
| [MEASURED.md](MEASURED.md) | Before reasoning about game mechanics or mining a log. |
| [DATA_REFRESH.md](DATA_REFRESH.md) | Before any wiki scrape or data top-up. |
| [WIKI.md](WIKI.md) | Before parsing wiki pages or writing pages for the wiki: links, page templates, conventions, caches, what the log can give a page. |
| [../RELEASING.md](../RELEASING.md) | Before a release (on `community_release_rules`). |
| [../plans/2026-10-18-scrape-rebaseline.md](../plans/2026-10-18-scrape-rebaseline.md) | Open: the era rules, the stale-scrape defect, the August catch-up (phases and status). |
| [../plans/2026-10-19-gaps-all-characters.md](../plans/2026-10-19-gaps-all-characters.md) | The Gaps tab across every character: the owner's answers (built on `gaps-all-characters`). |
| [../audits/2026-10-19-gaps-review.md](../audits/2026-10-19-gaps-review.md) | Before changing the Gaps tab: the review, the owner's eight decisions, what is left. |

Write style for these files: terse bullets, commands and facts, the reason in one clause. No
narrative, no session diaries, no commit hashes that only describe history. Record owner rulings
as decision + reason in neutral words (RULES.md rule 5).
