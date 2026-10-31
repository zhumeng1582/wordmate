import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connect} from './database';
async function main(){const {db,source}=await connect(process.env.DATABASE_URL??'');try{await db.transaction(async q=>{await q.query(readFileSync(resolve(__dirname,'../migrations/017_ai_accounts.sql'),'utf8'));await q.query(readFileSync(resolve(__dirname,'../migrations/018_family_ai.sql'),'utf8'));});console.log('AI accounts migrations 017–018 applied');}finally{await source.destroy();}}
main().catch(()=>{console.error('AI accounts migration failed. Verify preceding migrations and schema permissions.');process.exitCode=1;});
