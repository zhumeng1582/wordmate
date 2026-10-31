import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connect} from './database';
async function main(){
 const {db,source}=await connect(process.env.DATABASE_URL??'');
 try{await db.transaction(q=>q.query(readFileSync(resolve(__dirname,'../migrations/016_security_integrity.sql'),'utf8')));console.log('Security migration 016 applied; spending records preserved and invalid unspent makeup grants removed');}
 finally{await source.destroy();}
}
main().catch(()=>{console.error('Security migration failed. Verify preceding migrations and schema permissions.');process.exitCode=1;});
