#!/usr/bin/env bash
# Publish a TEST build to the fork's GitHub Releases page.
#
#   scripts/community/publish-release.sh [--version <v>] [--target <commit>] [--publish]
#
# Run from the clone that cut the build (main_community checked out). Without --publish it only
# checks and prints what it would do. The procedure, and why each check is here, is
# docs/community/RELEASING.md.
#
# The tag is community-<version>, never v<version>: a v* tag starts the creator's release job in
# .github/workflows/build.yml, which builds the official app and publishes toward his repo.
set -euo pipefail

repo_slug=cadetmedia/everquest-companion-AI
repo=$(git rev-parse --show-toplevel)
cd "$repo"

version=$(node -p "require('./package.json').version")
target=
publish=0
while [ $# -gt 0 ]; do
  case "$1" in
    --version) version=$2; shift ;;
    --target) target=$2; shift ;;
    --publish) publish=1 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

fail() { echo "STOP: $*" >&2; exit 1; }

case "$version" in
  *-test.*) ;;
  *) fail "version $version is not a 0.1.0-test.N build; only TEST builds are published from the fork" ;;
esac

tag="community-$version"
dir="release/$version"
exe="everquest-companion-ai-Setup-$version.exe"
[ -f "$dir/$exe" ] || fail "no installer at $dir/$exe; cut the build first (RELEASING.md step 1)"
# The update feed (test.20 on): installs read test.yml (the channel file electron-builder names after 0.1.0-test.N) from the newest release, and the blockmap
# lets them download only what changed. test.yml must name this version and this installer.
[ -f "$dir/test.yml" ] || fail "no $dir/test.yml; the build did not write its update file"
grep -q "^version: $version" "$dir/test.yml" || fail "$dir/test.yml does not name version $version"
grep -q "$exe" "$dir/test.yml" || fail "$dir/test.yml does not name $exe"
blockmap="$dir/$exe.blockmap"
[ -f "$blockmap" ] || fail "no $blockmap"

# The installer must carry its whole dependency tree (test.13 shipped without `conf`).
if [ -f "$dir/win-unpacked/resources/app.asar" ]; then
  asar_list=$(node_modules/.bin/asar list "$dir/win-unpacked/resources/app.asar" | tr -d '\r')
  modules=$(grep -c 'node_modules' <<<"$asar_list" || true)
  grep -q '[\\/]node_modules[\\/]conf$' <<<"$asar_list" || fail "the asar has no node_modules/conf; this build is broken"
  # Every runtime dependency the build's own package.json declares must be in it. A count was the
  # check until test.22, when the renderer-only packages left the installer (installer-size) and a
  # good build went from about 29,000 entries to under a thousand; naming the packages is exact.
  slashed=$(tr '\\' '/' <<<"$asar_list")
  for dep in $(node -p "Object.keys(require('./package.json').dependencies || {}).join(' ')"); do
    grep -qF "node_modules/$dep/package.json" <<<"$slashed" || fail "the asar has no node_modules/$dep; this build is broken"
  done
  echo "asar: $modules node_modules entries, every runtime dependency present"
else
  echo "note: $dir/win-unpacked is gone, so the asar was not re-checked; it was checked at the build"
fi

# The tester notes are the body of the version-bump commit on main_community (until 2026-10-26 it
# was made on test-neutering, whose history main_community carries). A fresh CI checkout has
# origin/main_community but may have no local branch of that name.
notes_ref=main_community
git rev-parse -q --verify "$notes_ref" >/dev/null || notes_ref=origin/main_community
notes_commit=$(git log --format=%H --grep="^Test build $version:" -1 "$notes_ref")
[ -n "$notes_commit" ] || fail "no 'Test build $version:' commit on main_community"
# Each release lists only what changed since the one before. The cumulative list lives once, on
# test.20 (the first release), and every later release links to it below.
first_tag=community-0.1.0-test.20
if [ "$tag" != "$first_tag" ] && git log -1 --format=%b "$notes_commit" | grep -q '^WHAT THIS BUILD ADDS'; then
  fail "the $version notes repeat the cumulative WHAT THIS BUILD ADDS list; keep only what changed since the previous version (it is on $first_tag)"
fi

if [ -z "$target" ]; then
  target=$(git rev-parse origin/main_community)
fi
target=$(git rev-parse "$target^{commit}")
git merge-base --is-ancestor "$notes_commit" "$target" || fail "$target does not contain the test.N commit $notes_commit"
git branch -r --contains "$target" | grep -q 'origin/main_community$' || fail "$target is not on origin/main_community; push first (RELEASING.md step 3)"

if gh release view "$tag" --repo "$repo_slug" >/dev/null 2>&1; then
  fail "release $tag already exists on $repo_slug"
fi

notes=$(mktemp)
trap 'rm -f "$notes"' EXIT
{
  cat <<EOF
**EQ Legends Companion AI $version**, a community build of [EQ Legends Companion](https://github.com/jmoyers/everquest-companion) with the fork's changes on top.

**To install:** download \`$exe\` below and run it. The installer is not code-signed, so Windows shows "Windows protected your PC" the first time: click **More info**, then **Run anyway**. It installs beside the official app, not over it, and keeps its own settings.

**Updates come from this page.** Once installed, the app checks this page every few hours, downloads a newer build quietly, and applies it when you close the app. It never installs the official app over itself, and the official app never replaces it.

\`SHA256SUMS.txt\` holds the installer's checksum, to compare with \`Get-FileHash $exe\`.

EOF
  [ "$tag" = "$first_tag" ] || echo "Below is what changed since the previous build. Everything this build adds to the official app is listed on [TEST 0.1.0-test.20](https://github.com/$repo_slug/releases/tag/$first_tag), the first release."
  printf '\n---\n\n'
  git log -1 --format=%b "$notes_commit"
} >"$notes"

(cd "$dir" && sha256sum "$exe" >SHA256SUMS.txt)

# The PREVIOUS release's blockmap rides along too. An install on that version asks the feed for
# its own installer's blockmap to download only what changed; the feed is the newest release, so
# without this copy every update is the whole installer. Best effort: the first release, or a
# previous release without one, simply means full downloads.
# Only that version's OWN blockmap: the previous release also carries the one before it, and a
# '*.exe.blockmap' pattern snowballed (test.35 shipped 16 of them, test.20 to test.35).
extra=()
prevdir=$(mktemp -d)
trap 'rm -f "$notes"; rm -rf "$prevdir"' EXIT
prev_tag=$(gh release view --repo "$repo_slug" --json tagName -q .tagName 2>/dev/null || true)
if [ -n "$prev_tag" ] && [ "$prev_tag" != "$tag" ]; then
  prev_blockmap="everquest-companion-ai-Setup-${prev_tag#community-}.exe.blockmap"
  if gh release download "$prev_tag" --repo "$repo_slug" --pattern "$prev_blockmap" --dir "$prevdir" >/dev/null 2>&1; then
    [ -f "$prevdir/$prev_blockmap" ] && extra+=("$prevdir/$prev_blockmap")
  fi
fi
if [ ${#extra[@]} -gt 0 ]; then
  echo "previous blockmap: $(basename "${extra[0]}") from $prev_tag"
else
  echo "previous blockmap: none (${prev_tag:-no earlier release}); an update from it downloads the whole installer"
fi

echo
echo "tag:     $tag"
echo "target:  $target"
echo "assets:  $dir/$exe ($(du -h "$dir/$exe" | cut -f1)), $dir/SHA256SUMS.txt, $dir/test.yml, $blockmap"
echo "notes:   from $(git log -1 --format='%h %s' "$notes_commit")"
echo

if [ $publish -eq 0 ]; then
  echo "----- release notes -----"
  cat "$notes"
  echo "-------------------------"
  echo "dry run: nothing published. Re-run with --publish once the owner has said yes."
  exit 0
fi

gh release create "$tag" --repo "$repo_slug" --target "$target" --latest \
  --title "EQ Legends Companion AI $version" --notes-file "$notes" \
  "$dir/$exe" "$dir/SHA256SUMS.txt" "$dir/test.yml" "$blockmap" "${extra[@]}"
