import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connect} from './database';
async function main(){const {db,source}=await connect(process.env.DATABASE_URL??'');try{await db.query(readFileSync(resolve(__dirname,'../migrations/019_parent_profiles.sql'),'utf8'));console.log('Parent profile migration 019 applied');}finally{await source.destroy();}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
