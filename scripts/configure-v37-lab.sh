#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
release_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
env_file="$release_dir/.env"
previous_env="$release_dir/../amnikon-ticketing-v36/.env"

if [ ! -f "$env_file" ]; then
  if [ ! -f "$previous_env" ]; then
    echo "Unable to find $previous_env; provide the existing v36 .env first." >&2
    exit 1
  fi
  cp -p "$previous_env" "$env_file"
fi

set_value() {
  key=$1
  value=$2
  temporary=$(mktemp "${env_file}.tmp.XXXXXX")
  awk -v key="$key" -v value="$value" '
    BEGIN { replaced = 0 }
    $0 ~ "^" key "=" {
      if (!replaced) print key "=" value
      replaced = 1
      next
    }
    { print }
    END { if (!replaced) print key "=" value }
  ' "$env_file" > "$temporary"
  chmod 600 "$temporary"
  mv "$temporary" "$env_file"
}

set_value RELEASE_TAG phase2-v37-lab-20260923
set_value CHANGE_EMAIL_ENABLED false
set_value CHANGE_EMAIL_SENDER changes@amnikontechnologies.com
set_value INITIAL_ADMIN_OBJECT_IDS ''
chmod 600 "$env_file"

echo "Configured v37 LAB release values in $env_file. Existing secrets were preserved."
