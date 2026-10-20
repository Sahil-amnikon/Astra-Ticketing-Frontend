#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
release_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
env_file="$release_dir/.env"
previous_env="$release_dir/../amnikon-ticketing-v40/.env"

if [ ! -f "$env_file" ]; then
  if [ ! -f "$previous_env" ]; then
    echo "Unable to find the v40 configuration at $previous_env." >&2
    exit 1
  fi
  cp -p "$previous_env" "$env_file"
fi

temporary=$(mktemp "${env_file}.tmp.XXXXXX")
trap 'rm -f "$temporary"' EXIT HUP INT TERM
awk '
  /^RELEASE_TAG=/ { if (!seen++) print "RELEASE_TAG=phase2-v41-lab-20260924"; next }
  { print }
  END { if (!seen) print "RELEASE_TAG=phase2-v41-lab-20260924" }
' "$env_file" > "$temporary"
chmod 600 "$temporary"
mv "$temporary" "$env_file"
trap - EXIT HUP INT TERM
echo 'Configured v41 LAB. Existing credentials, mail settings and encryption key were preserved.'
