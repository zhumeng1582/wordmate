import {connect} from './database';
import {AiAccounts,yuanMicros} from './ai-accounts';
async function main(){
 if(process.env.NODE_ENV!=='development'||process.env.AUTH_MODE!=='development')throw Error('Development-only credit tool');
 const [actor,yuan,reference]=process.argv.slice(2);if(!/^[0-9a-f-]{36}$/.test(actor??'')||!reference||reference.length>100)throw Error('Usage: ai-dev-credit.js USER_UUID YUAN UNIQUE_REFERENCE');
 const micros=yuanMicros(yuan),{db,source}=await connect(process.env.DATABASE_URL??'');
 try{const accounts=new AiAccounts(db,process.env);await db.transaction(async q=>{await q.query('SET LOCAL search_path TO wordmate,public');const user=(await q.query("SELECT id FROM users WHERE id=$1 AND status='active' FOR UPDATE",[actor])).rows[0];if(!user)throw Error('Account unavailable');await accounts.credit(q,actor,`development:${reference}`,micros);});console.log('Development credit recorded. Not a payment.');}finally{await source.destroy();}
}
main().catch(()=>{console.error('Credit not applied. Check development mode, user UUID, amount and unique reference.');process.exitCode=1;});
