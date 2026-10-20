exports.up = async function (db) {
  await db.raw(
    `WITH existing AS (
       UPDATE categories SET active=true,updated_at=now()
       WHERE id=(SELECT id FROM categories
         WHERE parent_id IS NULL AND lower(name)=lower('General Support') LIMIT 1)
       RETURNING id
     ), inserted AS (
       INSERT INTO categories(name,description,active)
       SELECT 'General Support','Requests that do not fit another available category.',true
       WHERE NOT EXISTS (SELECT 1 FROM existing)
       RETURNING id
     ), fallback AS (
       SELECT id FROM existing UNION ALL SELECT id FROM inserted LIMIT 1
     )
     UPDATE tickets SET category_id=(SELECT id FROM fallback)
     WHERE category_id IS NULL`,
  );
  await db.raw('ALTER TABLE tickets ALTER COLUMN category_id SET NOT NULL');
  await db('app_schema_state').where({ id: 1 }).update({ version: 7 });
};

exports.down = async function (db) {
  await db.raw('ALTER TABLE tickets ALTER COLUMN category_id DROP NOT NULL');
  await db('app_schema_state').where({ id: 1 }).update({ version: 6 });
};
