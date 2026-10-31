import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connect} from './database';

async function main(){
 const {db,source}=await connect(process.env.DATABASE_URL??'');
 try{await db.query(readFileSync(resolve(__dirname,'../migrations/012_checkin_makeup.sql'),'utf8'));console.log('Check-in makeup migration 012 applied.');}
 finally{await source.destroy();}
}
main().catch(()=>{console.error('Check-in makeup migration failed. Check database configuration and schema permissions.');process.exitCode=1;});
