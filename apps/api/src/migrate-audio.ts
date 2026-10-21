import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connect} from './database';
async function main(){
 const {db,source}=await connect(process.env.DATABASE_URL??'');
 try{await db.transaction(async q=>{await q.query(readFileSync(resolve(__dirname,'../migrations/002_audio.sql'),'utf8'));await q.query(readFileSync(resolve(__dirname,'../migrations/003_audio_preferences.sql'),'utf8'));await q.query(readFileSync(resolve(__dirname,'../migrations/004_voice_previews.sql'),'utf8'));await q.query(readFileSync(resolve(__dirname,'../migrations/005_audio_autoplay.sql'),'utf8'));await q.query(readFileSync(resolve(__dirname,'../migrations/006_checkin_shares.sql'),'utf8'));await q.query(readFileSync(resolve(__dirname,'../migrations/007_import_attempts.sql'),'utf8'));});console.log('Audio migrations 002/003/004/005/006/007 applied; existing learning data preserved');}
 finally{await source.destroy();}
}
main().catch(()=>{console.error('Audio migration failed. Check database configuration and schema permissions.');process.exitCode=1;});
