// Run on the server with production.env, alongside a pre-verified migration file.
const fs=require('node:fs');
const {Client}=require('/var/www/wordmate-current/apps/api/node_modules/pg');
const mode=process.argv[2];
if(!['preview','commit'].includes(mode))throw Error('Expected preview or commit');
const sql=fs.readFileSync('/var/tmp/wordmate-new-sailing-025.sql','utf8');
async function main(){
 const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,query_timeout:120000});await client.connect();
 try{
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='90s'");
  await client.query('SELECT pg_advisory_xact_lock(879466103)');
  const before=(await client.query('SELECT count(*)::int n FROM wordmate.users')).rows[0].n;
  const initial=(await client.query("SELECT to_regclass('wordmate.textbook_units') AS units, to_regclass('wordmate.textbook_unit_words') AS words, to_regclass('wordmate.textbook_joins') AS joins")).rows[0];
  if(Object.values(initial).some(Boolean))throw Error('Textbook tables already exist; inspect before proceeding');
  await client.query(sql);
  const counts=(await client.query('SELECT (SELECT count(*)::int FROM wordmate.textbook_units) units,(SELECT count(*)::int FROM wordmate.textbook_unit_words) words,(SELECT count(*)::int FROM wordmate.textbook_joins) joins,(SELECT count(*)::int FROM wordmate.users) users')).rows[0];
  if(counts.units!==20||counts.words!==147||counts.joins!==0||counts.users!==before)throw Error('Unexpected table counts');
  await client.query(mode==='commit'?'COMMIT':'ROLLBACK');
  console.log(JSON.stringify({mode,...counts,committed:mode==='commit'}));
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{await client.end();}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
