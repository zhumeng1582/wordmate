import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connect} from './database';
async function main(){const {db,source}=await connect(process.env.DATABASE_URL??'');try{await db.transaction(async q=>{await q.query(readFileSync(resolve(__dirname,'../migrations/015_privacy_lifecycle.sql'),'utf8'));await q.query(readFileSync(resolve(__dirname,'../migrations/016_security_integrity.sql'),'utf8'));});console.log('Privacy and lifecycle migrations 015–016 applied');}finally{await source.destroy();}}
main().catch(()=>{console.error('Privacy migration failed. Check preceding migrations and database permissions.');process.exitCode=1;});
