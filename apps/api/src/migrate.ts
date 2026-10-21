import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connect} from './database';
async function main(){const {db,source}=await connect(process.env.DATABASE_URL??'');try{
  const existing=await db.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name='wordmate'");
  if(existing.rows.length)throw Error('wordmate schema already exists; initial migration is for empty databases only');
  await db.query(readFileSync(resolve(__dirname,'../../../deliverables/0.1/database/001_schema.sql'),'utf8'));
  await db.query(readFileSync(resolve(__dirname,'../migrations/002_audio.sql'),'utf8'));await db.query(readFileSync(resolve(__dirname,'../migrations/003_audio_preferences.sql'),'utf8'));await db.query(readFileSync(resolve(__dirname,'../migrations/004_voice_previews.sql'),'utf8'));await db.query(readFileSync(resolve(__dirname,'../migrations/005_audio_autoplay.sql'),'utf8'));
  console.log('Initial schema and audio migration created');
}finally{await source.destroy();}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
