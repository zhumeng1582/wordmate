import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connect} from './database';
async function main(){
 const {db,source}=await connect(process.env.DATABASE_URL??'');
 try{
  await db.transaction(async q=>{await q.query(readFileSync(resolve(__dirname,'../migrations/014_release_fixes.sql'),'utf8'));await q.query(readFileSync(resolve(__dirname,'../migrations/015_privacy_lifecycle.sql'),'utf8'));await q.query(readFileSync(resolve(__dirname,'../migrations/016_security_integrity.sql'),'utf8'));});
  console.log('Release fixes migrations 014–016 applied; existing study data preserved');
 }finally{await source.destroy();}
}
main().catch(()=>{console.error('Release fixes migration failed. Check database configuration and schema permissions.');process.exitCode=1;});
