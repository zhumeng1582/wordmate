// Run only after backup, first in preview mode. Existing joined books are never modified.
const fs=require('node:fs');
const {Client}=require('/var/www/wordmate-current/apps/api/node_modules/pg');
const mode=process.argv[2];
if(!['preview','commit'].includes(mode))throw Error('Expected preview or commit');
const sql=fs.readFileSync('/var/tmp/wordmate-027-textbook-corrections.sql','utf8');
const supplied=JSON.parse(fs.readFileSync('/var/tmp/wordmate-textbook-corrections.json','utf8'));
async function main(){
 const c=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,query_timeout:120000});await c.connect();
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='90s'");
  await c.query('SELECT pg_advisory_xact_lock(879466103)');
  await c.query('LOCK TABLE wordmate.textbook_units,wordmate.textbook_unit_words,wordmate.textbook_volume_joins IN ACCESS EXCLUSIVE MODE');
  const stats=async()=>(await c.query('SELECT (SELECT count(*)::int FROM wordmate.users) users,(SELECT count(*)::int FROM wordmate.textbook_joins) unit_joins,(SELECT count(*)::int FROM wordmate.textbook_volume_joins) volume_joins,(SELECT count(*)::int FROM wordmate.child_words) child_words,(SELECT count(*)::int FROM wordmate.review_cards) cards')).rows[0];
  const before=await stats();if(before.volume_joins!==0)throw Error('Existing volume books require individual reconciliation');
  const preserved=await c.query("SELECT unit_id,ordinal,lemma,meaning_zh FROM wordmate.textbook_unit_words WHERE unit_id IN ('new-sailing-2-b-2','new-sailing-2-b-4','new-sailing-2-b-5') ORDER BY unit_id,ordinal");
  await c.query(sql);
  for(const [unit,expected] of Object.entries(supplied)){
   const actual=(await c.query('SELECT lemma FROM wordmate.textbook_unit_words WHERE unit_id=$1 ORDER BY ordinal',[unit])).rows.map(r=>r.lemma);
   if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Word list mismatch: '+unit);
  }
  const afterPreserved=await c.query("SELECT unit_id,ordinal,lemma,meaning_zh FROM wordmate.textbook_unit_words WHERE unit_id IN ('new-sailing-2-b-2','new-sailing-2-b-4','new-sailing-2-b-5') ORDER BY unit_id,ordinal");
  if(JSON.stringify(preserved.rows)!==JSON.stringify(afterPreserved.rows))throw Error('Unspecified units changed');
  const after=await stats(),total=(await c.query('SELECT count(*)::int n FROM wordmate.textbook_unit_words')).rows[0].n;
  if(JSON.stringify(before)!==JSON.stringify(after)||total!==233)throw Error('Unexpected migration result');
  await c.query(mode==='commit'?'COMMIT':'ROLLBACK');console.log(JSON.stringify({mode,provided_units:Object.keys(supplied).length,entries:total,...after}));
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{await c.end();}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
