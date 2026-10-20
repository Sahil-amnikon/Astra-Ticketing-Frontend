#!/bin/sh
set -eu
# Run from the project root on WEB, after migrations and services are started.
for service in backend frontend worker; do
  docker compose --env-file .env -f infra/compose.web.yml exec -T "$service" node -e '
    const port = process.argv[1];
    Promise.all(["health", "ready"].map(async route => {
      const r = await fetch(`http://127.0.0.1:${port}/${route}`);
      if (!r.ok) throw new Error(`${route}: ${r.status}`);
      console.log(`${route}: ${r.status}`);
    })).catch(e => { console.error(e.message); process.exit(1); });
  ' "$(case "$service" in backend) echo 3001;; frontend) echo 3000;; worker) echo 3002;; esac)"
done
docker compose --env-file .env -f infra/compose.web.yml exec -T redis redis-cli ping
