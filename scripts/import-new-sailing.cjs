// Import publisher lesson-plan vocabulary into source tables, not user learning data.
const {PGlite}=require('@electric-sql/pglite');
const {readFileSync,existsSync}=require('node:fs');
const {createHash}=require('node:crypto');
const {resolve}=require('node:path');
const units=JSON.parse(readFileSync('/private/tmp/new-sailing-units.json','utf8'));
if(!Array.isArray(units)||units.length!==20||units.some(u=>!u.source_url||!Array.isArray(u.words)||!u.words.length))throw Error('Invalid textbook data');
async function main(){
 const directory=resolve(__dirname,'../.local/dev-db');
 if(!existsSync(resolve(directory,'PG_VERSION')))throw Error('Existing local development database required');
 const db=new PGlite(directory);
 try{
  await db.waitReady;
  await db.exec(readFileSync(resolve(__dirname,'../apps/api/migrations/024_textbook_sources.sql'),'utf8'));
  await db.transaction(async tx=>{
   for(const unit of units){
    const rows=unit.words.map(word=>({word,unit:unit.unit,grade:unit.grade,term:unit.term,title:unit.title,source_type:'lesson_plan_core_vocabulary'}));
    const json=JSON.stringify(rows),hash=createHash('sha256').update(json).digest('hex');
    const label=`新起航英语 ${unit.grade}年级${unit.term} ${unit.title}`;
    await tx.query('INSERT INTO wordmate.textbook_source_batches(source_url,sha256,claimed_label) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[unit.source_url,hash,label]);
    await tx.query(`INSERT INTO wordmate.textbook_source_entries(source_url,sha256,ordinal,raw_entry)
      SELECT $1,$2,ordinality::int,value FROM jsonb_array_elements($3::jsonb) WITH ORDINALITY ON CONFLICT DO NOTHING`,[unit.source_url,hash,json]);
   }
  });
  const result=await db.query(`SELECT count(DISTINCT b.source_url)::int units,count(*)::int entries FROM wordmate.textbook_source_batches b JOIN wordmate.textbook_source_entries e USING(source_url,sha256) WHERE b.claimed_label LIKE '新起航英语 %'`);
  console.log(JSON.stringify({database:directory,...result.rows[0]}));
 }finally{await db.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
