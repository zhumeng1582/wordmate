import type {Sql} from './ports.ts';
import {ensure} from './errors.ts';
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
export function yuanMicros(value:unknown):number{
 ensure(typeof value==='string'&&/^\d{1,7}(?:\.\d{1,6})?$/.test(value),503,'AI_PRICE_NOT_CONFIGURED');
 const [a,b='']=value.split('.');const n=Number(a)*1000000+Number(b.padEnd(6,'0'));ensure(Number.isSafeInteger(n),503,'AI_PRICE_NOT_CONFIGURED');return n;
}
export async function settleAiCall(q:Sql,id:string){
  const initial=await one(q,'SELECT family_id,user_id FROM ai_calls WHERE id=$1',[id]);ensure(initial,409,'AI_CALL_EXPIRED');
  const wallet=initial.family_id?await one(q,'SELECT * FROM ai_family_wallets WHERE family_id=$1 FOR UPDATE',[initial.family_id]):undefined;
  const c=await one(q,'SELECT * FROM ai_calls WHERE id=$1 FOR UPDATE',[id]);if(c.state==='succeeded')return;ensure(c.state==='ready',409,'AI_CALL_EXPIRED');
  const charge=c.mode==='system'?Number(c.cost_micros):0;ensure(charge<=Number(c.reserved_micros),500,'AI_USAGE_OVER_RESERVATION');
  if(c.family_id){ensure(wallet,500,'AI_FAMILY_REQUIRED');const gift=Math.min(Number(wallet.gift_remaining_micros),charge);
   await q.query('UPDATE ai_family_wallets SET balance_micros=balance_micros-$2,frozen_micros=frozen_micros-$3,gift_remaining_micros=gift_remaining_micros-$4 WHERE family_id=$1',[c.family_id,charge,c.reserved_micros,gift]);
   await q.query("INSERT INTO ai_family_wallet_entries(family_id,user_id,kind,reference,amount_micros,gift_used_micros) VALUES($1,$2,'charge',$3,$4,$5)",[c.family_id,c.user_id,c.id,-charge,gift]);
  }
  await q.query("UPDATE ai_calls SET state='succeeded',charge_micros=$2,updated_at=now() WHERE id=$1",[id,charge]);
 }
export async function releaseAiCall(q:Sql,id:string,code:string,uncertain=false){
  const initial=await one(q,'SELECT family_id FROM ai_calls WHERE id=$1',[id]);if(!initial)return;if(initial.family_id)await q.query('SELECT family_id FROM ai_family_wallets WHERE family_id=$1 FOR UPDATE',[initial.family_id]);
  const c=await one(q,'SELECT * FROM ai_calls WHERE id=$1 FOR UPDATE',[id]);if(!['running','ready'].includes(c.state))return;
  if(c.family_id)await q.query('UPDATE ai_family_wallets SET frozen_micros=frozen_micros-$2 WHERE family_id=$1',[c.family_id,c.reserved_micros]);
  await q.query('UPDATE ai_calls SET state=$2,error_code=$3,updated_at=now() WHERE id=$1',[id,uncertain?'uncertain':'failed',code]);
 }
