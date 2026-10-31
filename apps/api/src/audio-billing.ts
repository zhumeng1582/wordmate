import type {Sql} from './ports.ts';
import {ensure} from './errors.ts';
import {audioCharacters,audioCost,type AudioTariff} from './audio-tariff.ts';
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
// Caller holds the active family/child and job locks. No provider call occurs here.
export async function reserveAudio(q:Sql,actor:string,child:string,job:string,text:string,tariff:AudioTariff){
 const family=(await one(q,'SELECT family_id FROM children WHERE id=$1',[child]))?.family_id;ensure(family,404,'CHILD_NOT_FOUND');
 const wallet=await one(q,'SELECT * FROM ai_family_wallets WHERE family_id=$1 FOR UPDATE',[family]);ensure(wallet,422,'AI_FAMILY_REQUIRED');
 const reference=`audio:${job}`,previous=await one(q,'SELECT * FROM ai_calls WHERE reference=$1 FOR UPDATE',[reference]);
 if(previous){ensure(previous.kind==='audio'&&previous.family_id===family,409,'AI_CALL_EXPIRED');if(['succeeded','running','ready'].includes(previous.state))return previous.id as string;}
 tariff=previous?.tariff??tariff;
 const characters=audioCharacters(text),cost=audioCost(characters,tariff);
 ensure(Number(wallet.balance_micros)-Number(wallet.frozen_micros)>=cost,402,'AI_INSUFFICIENT_BALANCE');
 await q.query('UPDATE ai_family_wallets SET frozen_micros=frozen_micros+$2 WHERE family_id=$1',[family,cost]);
 if(previous){await q.query("UPDATE ai_calls SET user_id=$2,state='running',reserved_micros=$3,cost_micros=$3,charge_micros=0,error_code=NULL,updated_at=now() WHERE id=$1",[previous.id,actor,cost]);return previous.id as string;}
 return (await one(q,"INSERT INTO ai_calls(reference,user_id,family_id,capability,kind,mode,provider,model,settings_version,state,reserved_micros,cost_micros,tariff,billable_characters) VALUES($1,$2,$3,'audio','audio','system','cosyvoice',$4,0,'running',$5,$5,$6,$7) RETURNING id",[reference,actor,family,tariff.model,cost,JSON.stringify(tariff),characters])).id as string;
}
