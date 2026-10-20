#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
release_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
env_file="$release_dir/.env"
previous_env="$release_dir/../amnikon-ticketing-v37/.env"

if [ ! -f "$env_file" ]; then
  if [ ! -f "$previous_env" ]; then
    echo "Unable to find the v37 configuration at $previous_env." >&2
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

set_value RELEASE_TAG phase2-v38-lab-20260924
set_value CHANGE_EMAIL_ENABLED false
set_value CHANGE_EMAIL_SENDER change@amnikontechnologies.com
set_value INITIAL_ADMIN_OBJECT_IDS ''

existing_key=$(sed -n 's/^MAIL_CONFIG_KEY=//p' "$env_file" | head -n 1)
if [ -z "$existing_key" ]; then
  if command -v openssl >/dev/null 2>&1; then
    new_key=$(openssl rand -hex 32)
  else
    new_key=$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')
  fi
  set_value MAIL_CONFIG_KEY "$new_key"
fi
chmod 600 "$env_file"
echo 'Configured v38 LAB. Existing credentials and mail encryption key were preserved.'
