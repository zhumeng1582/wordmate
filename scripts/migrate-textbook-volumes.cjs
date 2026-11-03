// Run from an unpacked release with production.env.
const fs=require('node:fs');
const {Client}=require('./apps/api/node_modules/pg');
const mode=process.argv[2];
if(!['preview','commit'].includes(mode))throw Error('Expected preview or commit');
async function main(){
 const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,query_timeout:120000});await client.connect();
 try{
  await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='90s'");await client.query('SELECT pg_advisory_xact_lock(879466103)');
  const before=(await client.query("SELECT (SELECT count(*)::int FROM wordmate.users) users,(SELECT count(*)::int FROM wordmate.textbook_joins) unit_joins,to_regclass('wordmate.textbook_volume_joins') AS existing")).rows[0];
  if(before.existing)throw Error('Volume table already exists');
  await client.query(fs.readFileSync('apps/api/migrations/026_textbook_volumes.sql','utf8'));
  const after=(await client.query("SELECT (SELECT count(*)::int FROM wordmate.users) users,(SELECT count(*)::int FROM wordmate.textbook_joins) unit_joins,(SELECT count(*)::int FROM wordmate.textbook_volume_joins) volume_joins")).rows[0];
  if(after.users!==before.users||after.unit_joins!==before.unit_joins||after.volume_joins!==0)throw Error('Unexpected migration result');
  await client.query(mode==='commit'?'COMMIT':'ROLLBACK');console.log(JSON.stringify({mode,...after}));
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{await client.end();}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
