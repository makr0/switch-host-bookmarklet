#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
userscript="${repo_root}/switch-host.user.js"

if [[ ! -f "$userscript" ]]; then
  printf 'Userscript not found: %s\n' "$userscript" >&2
  exit 1
fi

major=""
minor=""
patch=""
version_count=0

while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ ^([[:space:]]*//[[:space:]]*@version[[:space:]]+)([0-9]+)\.([0-9]+)\.([0-9]+)([[:space:]]*)$ ]]; then
    major="${BASH_REMATCH[2]}"
    minor="${BASH_REMATCH[3]}"
    patch="${BASH_REMATCH[4]}"
    version_count=$((version_count + 1))
  fi
done < "$userscript"

if [[ "$version_count" -ne 1 ]]; then
  printf 'Expected exactly one @version line, found %d\n' "$version_count" >&2
  exit 1
fi

new_patch=$((10#${patch} + 1))
new_version="${major}.${minor}.${new_patch}"

tmp_file=$(mktemp "${userscript}.XXXXXX")
trap 'rm -f "$tmp_file"' EXIT

while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ ^([[:space:]]*//[[:space:]]*@version[[:space:]]+)([0-9]+)\.([0-9]+)\.([0-9]+)([[:space:]]*)$ ]]; then
    printf '%s%s.%s.%s%s\n' "${BASH_REMATCH[1]}" "$major" "$minor" "$new_patch" "${BASH_REMATCH[5]}"
  else
    printf '%s\n' "$line"
  fi
done < "$userscript" > "$tmp_file"

mv "$tmp_file" "$userscript"
trap - EXIT

git -C "$repo_root" tag "v${new_version}"

printf 'Released v%s\n' "$new_version"
