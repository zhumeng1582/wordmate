import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connect} from './database';
async function main(){const {db,source}=await connect(process.env.DATABASE_URL??'');try{await db.query(readFileSync(resolve(__dirname,'../migrations/013_referrals.sql'),'utf8'));console.log('Referral migration 013 applied; existing accounts assigned referral codes');}finally{await source.destroy();}}
main().catch((error:unknown)=>{const e=error as {code?:unknown;message?:unknown};const message=typeof e?.message==='string'?e.message.replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi,'$1[redacted]'):'Unknown error';console.error(`Referral migration failed${e?.code?` [${String(e.code)}]`:''}: ${message}`);process.exitCode=1;});
