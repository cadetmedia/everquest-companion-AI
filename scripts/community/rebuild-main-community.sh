#!/usr/bin/env bash
# RETIRED 2026-10-26. This script rebuilt main_community from the recipe in
# docs/community/BRANCHES.md: a fresh branch off main with every recipe branch merged in order.
# main_community is now the trunk and carries commits of its own, so a rebuild would drop them.
# Work goes on a short-lived branch off main_community instead (docs/community/RULES.md, rules 1
# and 3). The last version of the script is in git history: `git log -- <this file>`.
echo "rebuild-main-community.sh is retired (2026-10-26): main_community is the trunk; see docs/community/RULES.md" >&2
exit 1
