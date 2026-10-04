const { DatabaseSync } = require('node:sqlite');
const { Client } = require('pg');
const path = require('path');

const sqlite = new DatabaseSync(path.join(__dirname, 'tamari.db'));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL が設定されていません。');
  process.exit(1);
}

const tables = [
  ['users', ['id','username','display','pw','bio','likes','interests','avatar','bg','status','created','status_line','quote','hobbies','accent','layout','video','inbox','home_visible']],
  ['blocks', ['a','b']],
  ['chats', ['id','a','b','created','last']],
  ['diaries', ['id','user','body','created']],
  ['follows', ['a','b']],
  ['links', ['id','user','title','url','sort']],
  ['sessions', ['token','user','created']],
  ['messages', ['id','chat','user','body','image','created','deleted']],
  ['message_reads', ['chat','user','read_at']],
  ['posts', ['id','user','body','image','video','created','deleted']],
  ['post_reactions', ['post','user','kind','created']],
  ['post_replies', ['id','post','user','body','created','deleted','parent']],
  ['post_reply_reactions', ['reply','user','created']],
  ['replies', ['id','diary','user','stamp','body','created']],
  ['notices', ['id','user','kind','data','created','seen']],
  ['shots', ['user','day','image','caption','created']]
];

const quote = s => '"' + s.replace(/"/g, '""') + '"';

async function main() {
  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('Supabaseへ接続しています...');
  await pg.connect();
  console.log('Supabase接続成功');

  try {
    await pg.query('BEGIN');

    for (const [table, columns] of tables) {
      const cols = columns.map(quote).join(', ');

      const rows = sqlite.prepare(
        `SELECT ${cols} FROM ${quote(table)}`
      ).all();

      console.log('');
      console.log(`=== ${table} ===`);
      console.log(`SQLite: ${rows.length}件`);

      if (rows.length === 0) {
        console.log('スキップ');
        continue;
      }

      const values = [];
      const valueGroups = [];
      let parameter = 1;

      for (const row of rows) {
        const group = [];

        for (const column of columns) {
          let value = row[column];

          if (value === undefined) {
            value = null;
          }

          values.push(value);
          group.push('$' + parameter);
          parameter++;
        }

        valueGroups.push('(' + group.join(', ') + ')');
      }

      const sql = `
        INSERT INTO public.${quote(table)} (${cols})
        VALUES ${valueGroups.join(', ')}
        ON CONFLICT DO NOTHING
      `;

      const result = await pg.query(sql, values);

      console.log(`Supabase追加: ${result.rowCount}件`);
    }

    await pg.query('COMMIT');

    console.log('');
    console.log('================================');
    console.log('Tamari データ移行 完了');
    console.log('================================');
    console.log('');
    console.log('元のtamari.dbは削除していません。');
    console.log('tamari_backup.dbも削除していません。');

  } catch (error) {
    try {
      await pg.query('ROLLBACK');
    } catch (_) {}

    console.error('');
    console.error('================================');
    console.error('移行失敗');
    console.error('================================');
    console.error(error.message);
    console.error('');
    console.error('Supabase側の今回の処理はロールバックしました。');

    process.exitCode = 1;

  } finally {
    sqlite.close();
    await pg.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
