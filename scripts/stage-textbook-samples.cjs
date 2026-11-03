// Store unverified source files separately from the application's learning data.
const {PGlite}=require('@electric-sql/pglite');
const {readFileSync,existsSync}=require('node:fs');
const {createHash}=require('node:crypto');
const {resolve}=require('node:path');

const samples=[
  {file:'/private/tmp/word-pep-3a.json', label:'人教 PEP 三年级上册（提交者标注 2024）', source:'https://github.com/user-attachments/files/24341427/PEP.2024.json'},
  {file:'/private/tmp/word-pep-3b.json', label:'人教 PEP 三年级下册（提交者标注 2024）', source:'https://github.com/user-attachments/files/24341426/PEP.2024.json'},
  {file:'/private/tmp/word-pep-4a.json', label:'人教 PEP 四年级上册（提交者标注 2025）', source:'https://github.com/user-attachments/files/24341428/PEP.2025.json'}
].map(s=>{
  const bytes=readFileSync(s.file),rows=JSON.parse(bytes.toString('utf8'));
  if(!Array.isArray(rows)||!rows.length||rows.some(r=>!r||typeof r.name!=='string'||!Array.isArray(r.trans)))throw Error(`Invalid source: ${s.file}`);
  return {...s,rows,sha256:createHash('sha256').update(bytes).digest('hex')};
});

async function main(){
  const directory=resolve(__dirname,'../.local/dev-db');
  if(!existsSync(resolve(directory,'PG_VERSION')))throw Error('Existing local development database required');
  const db=new PGlite(directory);
  try{
    await db.waitReady;
    await db.exec(readFileSync(resolve(__dirname,'../apps/api/migrations/024_textbook_sources.sql'),'utf8'));
    await db.transaction(async tx=>{
      for(const s of samples){
        await tx.query('INSERT INTO wordmate.textbook_source_batches(source_url,sha256,claimed_label) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[s.source,s.sha256,s.label]);
        await tx.query(`INSERT INTO wordmate.textbook_source_entries(source_url,sha256,ordinal,raw_entry)
          SELECT $1,$2,ordinality::int,value FROM jsonb_array_elements($3::jsonb) WITH ORDINALITY
          ON CONFLICT DO NOTHING`,[s.source,s.sha256,JSON.stringify(s.rows)]);
      }
    });
    const result=await db.query(`SELECT b.claimed_label,b.review_status,count(e.ordinal)::int AS entries
      FROM wordmate.textbook_source_batches b JOIN wordmate.textbook_source_entries e USING(source_url,sha256)
      GROUP BY b.source_url,b.sha256,b.claimed_label,b.review_status ORDER BY b.claimed_label`);
    console.log(JSON.stringify({database:directory,batches:result.rows},null,2));
  }finally{await db.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
