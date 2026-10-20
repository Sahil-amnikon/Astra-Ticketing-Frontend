#!/bin/sh
set -eu
# Roles are created only on first initialization of an empty volume.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 --set=app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE amnikon_app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE amnikon TO amnikon_app;
GRANT USAGE ON SCHEMA public TO amnikon_app;
SQL
