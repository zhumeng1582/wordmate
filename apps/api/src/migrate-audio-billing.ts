import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connect} from './database';
async function main(){const {db,source}=await connect(process.env.DATABASE_URL??'');try{await db.transaction(q=>q.query(readFileSync(resolve(__dirname,'../migrations/020_audio_billing.sql'),'utf8')));console.log('Audio billing migration 020 applied');}finally{await source.destroy();}}
main().catch(()=>{console.error('Audio billing migration failed.');process.exitCode=1;});
