exports.up = async function (db) {
  await db.raw(
    'ALTER TABLE tickets ALTER COLUMN created_by_user_id DROP NOT NULL',
  );
  await db.raw('UPDATE app_schema_state SET version=19 WHERE id=1');
};

exports.down = async function () {
  throw new Error(
    'Restore a verified backup to roll back automated email intake.',
  );
};
