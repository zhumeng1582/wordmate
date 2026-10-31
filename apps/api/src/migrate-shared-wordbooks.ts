import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connect} from './database';
async function main(){const {db,source}=await connect(process.env.DATABASE_URL??'');try{await db.query(readFileSync(resolve(__dirname,'../migrations/008_shared_wordbooks.sql'),'utf8'));console.log('Shared wordbook migration 008 applied; existing study data preserved');}finally{await source.destroy();}}
main().catch(()=>{console.error('Shared wordbook migration failed. Check database configuration and schema permissions.');process.exitCode=1;});
