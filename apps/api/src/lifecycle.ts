import {createHash,randomUUID} from 'node:crypto';
import {unlink} from 'node:fs/promises';
import {join} from 'node:path';
import type {Database,Sql,Row} from './ports.ts';
import type {AudioRuntime} from './audio-runtime.ts';
import type {CheckinShareImageCache} from './checkin-share-images.ts';
import {ensure,uuid} from './errors.ts';
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
const digest=(b:any)=>createHash('sha256').update(JSON.stringify(b)).digest('hex');
const dto=(j:Row)=>Object.fromEntries(['id','kind','target_id','family_id','status','phase','attempts','error_code','created_at','completed_at'].map(k=>[k,j[k]]));
export class Lifecycle {
 private db:Database;private audio?:AudioRuntime;private images?:CheckinShareImageCache;
 constructor(db:Database,audio?:AudioRuntime,images?:CheckinShareImageCache){this.db=db;this.audio=audio;this.images=images;}
 private tx<T>(fn:(q:Sql)=>Promise<T>){return this.db.transaction(async q=>{await q.query('SET LOCAL search_path TO wordmate,public');return fn(q);});}
 private async active(q:Sql,actor:string){ensure(await one(q,"SELECT 1 FROM users WHERE id=$1 AND status='active'",[actor]),401,'ACCOUNT_UNAVAILABLE');}
 private async family(q:Sql,actor:string,id:string,owner=false){
  await this.active(q,actor);const f=await one(q,"SELECT * FROM families WHERE id=$1 AND status='active' FOR UPDATE",[uuid(id)]);
  ensure(f&&await one(q,"SELECT 1 FROM family_members WHERE family_id=$1 AND user_id=$2 AND status='active'",[id,actor]),404,'FAMILY_NOT_FOUND');
  if(owner)ensure(f.owner_user_id===actor,403,'OWNER_REQUIRED');return f;
 }
 async overview(actor:string){return this.tx(async q=>{
  await this.active(q,actor);const families=(await q.query("SELECT f.id,f.name,f.version,f.owner_user_id,CASE WHEN f.owner_user_id=$1 THEN 'owner' ELSE 'parent' END role FROM families f JOIN family_members m ON m.family_id=f.id WHERE m.user_id=$1 AND m.status='active' AND f.status='active' ORDER BY f.id",[actor])).rows;
  for(const f of families){f.children=(await q.query('SELECT id,nickname,version FROM children WHERE family_id=$1 AND archived_at IS NULL ORDER BY created_at',[f.id])).rows;f.members=(await q.query("SELECT user_id,display_name FROM family_members WHERE family_id=$1 AND status='active' ORDER BY joined_at",[f.id])).rows;}
  return {families};
 });}
 async jobs(actor:string){return this.tx(async q=>({items:(await q.query("SELECT * FROM lifecycle_jobs WHERE requested_by=$1 ORDER BY (status='succeeded'),created_at DESC,id DESC LIMIT 100",[actor])).rows.map(dto)}));}
 async job(actor:string,id:string){return this.tx(async q=>{const j=await one(q,'SELECT * FROM lifecycle_jobs WHERE id=$1 AND requested_by=$2',[uuid(id),actor]);ensure(j,404,'DELETION_NOT_FOUND');return dto(j);});}
 async retry(actor:string,id:string){return this.tx(async q=>{
  await this.active(q,actor);const j=await one(q,'SELECT * FROM lifecycle_jobs WHERE id=$1 AND requested_by=$2 FOR UPDATE',[uuid(id),actor]);ensure(j,404,'DELETION_NOT_FOUND');
  if(j.status==='failed')await q.query("UPDATE lifecycle_jobs SET status='queued',attempts=0,error_code=NULL,next_attempt_at=now(),lease_until=NULL,lease_token=NULL WHERE id=$1",[id]);
  return dto(await one(q,'SELECT * FROM lifecycle_jobs WHERE id=$1',[id]));
 });}
 private async replay(q:Sql,actor:string,kind:string,id:string,b:any){const j=await one(q,'SELECT * FROM lifecycle_jobs WHERE kind=$1 AND target_id=$2',[kind,uuid(id)]);if(j){ensure(j.requested_by===actor,404,'DELETION_NOT_FOUND');ensure(j.request_hash===digest(b),409,'DELETION_REQUEST_CHANGED');return dto(j);}}
 private async freeze(q:Sql,ids:string[]){
  if(!ids.length)return;
  await q.query('UPDATE children SET archived_at=coalesce(archived_at,now()),version=version+1 WHERE id=ANY($1::uuid[])',[ids]);
  await q.query("UPDATE study_sessions SET status='revoked',ended_at=now() WHERE child_id=ANY($1::uuid[]) AND status='active'",[ids]);
  await q.query("UPDATE generation_jobs SET status='cancelled',error_code='DELETION_IN_PROGRESS' WHERE child_id=ANY($1::uuid[]) AND status IN ('queued','running','partial')",[ids]);
  await q.query('UPDATE shared_wordbooks SET published=false,version=version+1 WHERE source_child_id=ANY($1::uuid[]) AND published',[ids]);
  // These rows do not contain personal text beyond generic encouragement, but
  // invalidate per-child assignments immediately while keeping shared pool assets.
  await q.query("UPDATE checkin_share_images SET expires_at=now(),lease_token=NULL,lease_until=NULL WHERE split_part(cache_scope,':',1)=ANY($1::text[])",[ids]);
 }
 private async enqueue(q:Sql,actor:string,family:string,target:string,kind:string,b:any,children:string[],receipt?:Row){
  const job=receipt??await one(q,'INSERT INTO lifecycle_jobs(requested_by,family_id,target_id,kind,request_hash) VALUES($1,$2,$3,$4,$5) RETURNING *',[actor,family,target,kind,digest(b)]);
  await q.query('INSERT INTO deletion_tombstones(kind,target_id,family_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[kind,target,family]);
  for(const child of children){
   await q.query("INSERT INTO deletion_tombstones(kind,target_id,family_id) VALUES('delete_child',$1,$2) ON CONFLICT DO NOTHING",[child,family]);
   const assets=(await q.query('SELECT storage_profile_id,storage_key FROM audio_assets WHERE child_id=$1 AND storage_key IS NOT NULL',[child])).rows;
   for(const a of assets)await this.object(q,job.id,'audio',a.storage_profile_id??'',a.storage_key);
   const jobs=(await q.query("SELECT id,payload,max_attempts FROM generation_jobs WHERE child_id=$1 AND kind='audio'",[child])).rows;
   for(const j of jobs)for(let attempt=1;attempt<=j.max_attempts;attempt++){
    await this.object(q,job.id,'audio',j.payload.storage_profile??'',`private/${child}/${j.id}/${attempt}.mp3`);
    await this.object(q,job.id,'spool','',`${j.id}-${attempt}.mp3`);
   }
  }
  return dto(job);
 }
 private async object(q:Sql,job:string,kind:string,profile:string,key:string){await q.query('INSERT INTO lifecycle_objects(job_id,kind,profile,object_key) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[job,kind,profile,key]);}
 async deleteChild(actor:string,id:string,b:any){return this.tx(async q=>{
  await this.active(q,actor);const old=await this.replay(q,actor,'delete_child',id,b);if(old)return old;
  const initial=await one(q,'SELECT family_id FROM children WHERE id=$1',[uuid(id)]);ensure(initial,404,'CHILD_NOT_FOUND');await this.family(q,actor,initial.family_id,true);
  const c=await one(q,'SELECT * FROM children WHERE id=$1 AND archived_at IS NULL FOR UPDATE',[id]);ensure(c,404,'CHILD_NOT_FOUND');
  ensure(c.version===b.expected_version,409,'CHILD_CHANGED');ensure(c.nickname===b.confirm_nickname,422,'CONFIRMATION_MISMATCH');
  await this.freeze(q,[id]);return this.enqueue(q,actor,c.family_id,id,'delete_child',b,[id]);
 });}
 async deleteFamily(actor:string,id:string,b:any){return this.tx(async q=>{
  await this.active(q,actor);const old=await this.replay(q,actor,'delete_family',id,b);if(old)return old;
  const f=await this.family(q,actor,id,true);ensure(f.version===b.expected_version,409,'FAMILY_CHANGED');ensure(f.name===b.confirm_name&&b.confirm_data_deletion===true,422,'CONFIRMATION_MISMATCH');
  ensure(!await one(q,"SELECT 1 FROM family_members WHERE family_id=$1 AND user_id<>$2 AND status='active'",[id,actor]),409,'FAMILY_HAS_OTHER_MEMBERS');
  ensure(!await one(q,"SELECT 1 FROM lifecycle_jobs WHERE family_id=$1 AND status<>'succeeded'",[id]),409,'DELETION_IN_PROGRESS');
  if((await one(q,"SELECT to_regclass('wordmate.ai_family_wallets') present"))?.present){const w=await one(q,'SELECT * FROM ai_family_wallets WHERE family_id=$1 FOR UPDATE',[id]);ensure(!w||Number(w.balance_micros)===Number(w.gift_remaining_micros)&&Number(w.frozen_micros)===0,409,'AI_BALANCE_REMAINS');ensure(!await one(q,"SELECT 1 FROM ai_recharge_orders WHERE family_id=$1 AND state='pending'",[id]),409,'AI_PAYMENT_PENDING');}
  const children=(await q.query('SELECT id FROM children WHERE family_id=$1 ORDER BY id FOR UPDATE',[id])).rows.map(c=>c.id);
  await q.query("UPDATE families SET status='deleting',version=version+1 WHERE id=$1",[id]);
  await q.query("UPDATE family_invites SET status='revoked' WHERE family_id=$1 AND status IN ('pending','claimed')",[id]);
  await this.freeze(q,children);return this.enqueue(q,actor,id,id,'delete_family',b,children);
 });}
 async transfer(actor:string,id:string,b:any){return this.tx(async q=>{
  const f=await this.family(q,actor,id,true);ensure(f.version===b.expected_version,409,'FAMILY_CHANGED');
  ensure(b.member_user_id!==actor&&await one(q,"SELECT 1 FROM family_members m JOIN users u ON u.id=m.user_id WHERE m.family_id=$1 AND m.user_id=$2 AND m.status='active' AND u.status='active'",[id,uuid(b.member_user_id)]),422,'INVALID_NEW_OWNER');
  await q.query('UPDATE families SET owner_user_id=$2,version=version+1 WHERE id=$1',[id,b.member_user_id]);await q.query("INSERT INTO audit_logs(family_id,actor_user_id,action,target_type,target_id) VALUES($1,$2,'transfer_owner','user',$3)",[id,actor,b.member_user_id]);return {id,owner_user_id:b.member_user_id,version:f.version+1};
 });}
 async leave(actor:string,id:string,target=actor){return this.tx(async q=>{
  const f=await this.family(q,actor,id,target!==actor);ensure(f.owner_user_id!==target,409,'OWNER_TRANSFER_OR_DISSOLVE_REQUIRED');
  await q.query("UPDATE family_members SET status=$3,revoked_at=now(),display_name='已离开家长' WHERE family_id=$1 AND user_id=$2 AND status='active'",[id,uuid(target),target===actor?'left':'removed']);
  await q.query("UPDATE study_sessions SET status='revoked',ended_at=now() WHERE child_id IN (SELECT id FROM children WHERE family_id=$1) AND actor_user_id=$2 AND status='active'",[id,target]);
  await q.query("UPDATE generation_jobs SET status='failed',lease_until=NULL,error_code='FAMILY_NOT_FOUND' WHERE child_id IN (SELECT id FROM children WHERE family_id=$1) AND requested_by=$2 AND status IN ('queued','running','partial')",[id,target]);
  await q.query("UPDATE family_invites SET status='revoked' WHERE family_id=$1 AND (created_by=$2 OR claimed_by=$2) AND status IN ('pending','claimed')",[id,target]);
  await q.query('UPDATE families SET version=version+1 WHERE id=$1',[id]);await q.query("INSERT INTO audit_logs(family_id,actor_user_id,action,target_type,target_id) VALUES($1,$2,$3,'user',$4)",[id,actor,target===actor?'leave_family':'remove_member',target]);return {left:true,user_id:target};
 });}
 async purgeEphemeral(){await this.tx(async q=>{await q.query("DELETE FROM provider_usage_events WHERE created_at<=now()-interval '48 hours'");await q.query('DELETE FROM idempotency_keys WHERE expires_at<=now()');await q.query("DELETE FROM auth_sessions WHERE expires_at<=now() OR revoked_at<now()-interval '24 hours'");});}
 async logout(actor:string,token:string){await this.tx(q=>q.query('UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND token_hash=$2',[actor,createHash('sha256').update(token).digest('hex')]));return {logged_out:true};}
 async deleteAccount(actor:string){return this.tx(async q=>{
  // Lock every membership's family before the account row: same order as writes.
  await q.query('SELECT f.id FROM families f JOIN family_members m ON m.family_id=f.id WHERE m.user_id=$1 ORDER BY f.id FOR UPDATE OF f',[actor]);
  ensure(await one(q,"SELECT 1 FROM users WHERE id=$1 AND status='active' FOR UPDATE",[actor]),401,'ACCOUNT_UNAVAILABLE');
  ensure(!await one(q,'SELECT 1 FROM families WHERE owner_user_id=$1',[actor]),409,'OWNER_TRANSFER_OR_DISSOLVE_REQUIRED');
  ensure(!await one(q,"SELECT 1 FROM lifecycle_jobs WHERE requested_by=$1 AND status<>'succeeded'",[actor]),409,'DELETION_IN_PROGRESS');
  return this.eraseAccount(q,actor);
 });}
 private async eraseAccount(q:Sql,actor:string){
  if((await one(q,"SELECT to_regclass('wordmate.ai_capability_settings') present"))?.present)await q.query('DELETE FROM ai_capability_settings WHERE user_id=$1',[actor]);
  if((await one(q,"SELECT to_regclass('wordmate.ai_wallets') present"))?.present){const wallet=await one(q,'SELECT * FROM ai_wallets WHERE user_id=$1 FOR UPDATE',[actor]);ensure(!wallet||Number(wallet.balance_micros)===0&&Number(wallet.frozen_micros)===0,409,'AI_BALANCE_REMAINS');ensure(!await one(q,"SELECT 1 FROM ai_recharge_orders WHERE user_id=$1 AND state='pending'",[actor]),409,'AI_PAYMENT_PENDING');await q.query('DELETE FROM ai_account_settings WHERE user_id=$1',[actor]);}

  if(this.images)await this.images.deleteAccount(q,actor);else await this.deleteUnstoredImages(q,'requested_by=$1',actor);
  await q.query("UPDATE study_sessions SET status='revoked',ended_at=now() WHERE actor_user_id=$1 AND status='active'",[actor]);
  await q.query("UPDATE generation_jobs SET status='failed',lease_until=NULL,error_code='ACCOUNT_UNAVAILABLE' WHERE requested_by=$1 AND status IN ('queued','running','partial')",[actor]);
  await q.query("UPDATE family_invites SET status='revoked',claimed_by=NULL,approved_by=NULL WHERE (created_by=$1 OR claimed_by=$1 OR approved_by=$1)",[actor]);
  await q.query("UPDATE family_members SET status='left',revoked_at=now(),display_name='已注销家长' WHERE user_id=$1",[actor]);
  for(const [table,column] of [['wordbooks','created_by'],['batches','created_by'],['child_words','created_by'],['sentences','created_by'],['word_annotations','updated_by'],['word_corrections','created_by'],['word_corrections','resolved_by'],['monthly_quizzes','created_by'],['review_logs','actor_user_id'],['audit_logs','actor_user_id'],['generation_jobs','requested_by']])await q.query(`UPDATE ${table} SET ${column}=NULL WHERE ${column}=$1`,[actor]);
  await q.query('UPDATE shared_wordbooks SET published=false,version=version+1 WHERE publisher_user_id=$1 AND published',[actor]);
  await q.query('DELETE FROM import_attempts WHERE actor_id=$1',[actor]);await q.query('DELETE FROM checkin_share_quotes WHERE requested_by=$1',[actor]);
  for(const table of ['auth_sessions','idempotency_keys','privacy_consent_events'])await q.query(`DELETE FROM ${table} WHERE ${table==='idempotency_keys'?'actor_user_id':table==='privacy_consent_events'?'user_id':'user_id'}=$1`,[actor]);
  await q.query('DELETE FROM user_referrals WHERE invited_user_id=$1 OR inviter_user_id=$1',[actor]);
  await q.query("UPDATE users SET status='deleted',wx_open_id=$2,display_name='已注销用户',referral_code=$3,avatar_bytes=NULL,avatar_mime=NULL,avatar_revision=avatar_revision+1,profile_version=profile_version+1,audio_voice_id=NULL,audio_accent='en-GB',audio_auto_play=false,audio_settings_version=1 WHERE id=$1",[actor,`deleted:${randomUUID()}`,randomUUID()]);
  await q.query("INSERT INTO deletion_tombstones(kind,target_id,completed_at) VALUES('delete_account',$1,now()) ON CONFLICT(kind,target_id) DO UPDATE SET completed_at=excluded.completed_at",[actor]);
  return {deleted:true};
 }

 // Maintenance-only methods: no HTTP route exposes the cross-account ledger.
 async exportLedger(){return this.tx(async q=>({version:1,entries:(await q.query("SELECT t.kind,t.target_id,t.family_id,t.requested_at,t.completed_at,coalesce(j.requested_by,fj.requested_by,CASE WHEN t.kind='delete_account' THEN t.target_id END) requested_by FROM deletion_tombstones t LEFT JOIN lifecycle_jobs j ON j.kind=t.kind AND j.target_id=t.target_id LEFT JOIN lifecycle_jobs fj ON fj.kind='delete_family' AND fj.target_id=t.family_id ORDER BY t.requested_at,t.kind,t.target_id")).rows}));}
 async restoreLedger(document:any){
  ensure(document?.version===1&&Array.isArray(document.entries)&&document.entries.length<=100000,422,'INVALID_DELETION_LEDGER');
  for(const e of document.entries){ensure(e&&typeof e==='object'&&!Array.isArray(e),422,'INVALID_DELETION_LEDGER');ensure(['delete_child','delete_family','delete_account'].includes(e.kind),422,'INVALID_DELETION_LEDGER');uuid(e.target_id);if(e.family_id)uuid(e.family_id);if(e.requested_by)uuid(e.requested_by);}
  // Validate the entire file before touching restored records; process accounts last.
  for(const e of [...document.entries].sort((a,b)=>Number(a.kind==='delete_account')-Number(b.kind==='delete_account')))await this.tx(async q=>{
   await q.query('INSERT INTO deletion_tombstones(kind,target_id,family_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[e.kind,e.target_id,e.family_id??null]);
   if(e.kind==='delete_account'){
    await q.query("UPDATE families SET status='deleting' WHERE owner_user_id=$1",[e.target_id]);
    const user=await one(q,"SELECT id FROM users WHERE id=$1 AND status<>'deleted' FOR UPDATE",[e.target_id]);if(user)await this.eraseAccount(q,e.target_id);return;
   }
   const initial=e.kind==='delete_child'?await one(q,'SELECT family_id FROM children WHERE id=$1',[e.target_id]):await one(q,'SELECT id family_id FROM families WHERE id=$1',[e.target_id]);
   if(!initial)return;
   await q.query('SELECT id FROM families WHERE id=$1 FOR UPDATE',[initial.family_id]);
   const children=e.kind==='delete_child'?[e.target_id]:(await q.query('SELECT id FROM children WHERE family_id=$1 ORDER BY id FOR UPDATE',[initial.family_id])).rows.map(c=>c.id);
   if(e.kind==='delete_family'){await q.query("UPDATE families SET status='deleting' WHERE id=$1",[initial.family_id]);await q.query("UPDATE family_invites SET status='revoked' WHERE family_id=$1 AND status IN ('pending','claimed')",[initial.family_id]);}
   await this.freeze(q,children);
   const existing=await one(q,'SELECT * FROM lifecycle_jobs WHERE kind=$1 AND target_id=$2 FOR UPDATE',[e.kind,e.target_id]);
   if(existing){await q.query("UPDATE lifecycle_jobs SET status='queued',phase='freeze',completed_at=NULL,attempts=0,lease_token=NULL,lease_until=NULL,next_attempt_at=now() WHERE id=$1",[existing.id]);await q.query('DELETE FROM lifecycle_objects WHERE job_id=$1',[existing.id]);}
   ensure(e.requested_by&&await one(q,'SELECT 1 FROM users WHERE id=$1',[e.requested_by]),422,'INVALID_DELETION_LEDGER');
   await this.enqueue(q,e.requested_by,initial.family_id,e.target_id,e.kind,{restored:true},children,existing);
  });
 }
 private async owned(q:Sql,j:Row){const row=await one(q,"SELECT * FROM lifecycle_jobs WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_until>now() FOR UPDATE",[j.id,j.lease_token]);ensure(row,409,'DELETION_LEASE_LOST');return row;}
 async processOne(){
  const j=await this.tx(q=>one(q,"WITH claimed AS (UPDATE lifecycle_jobs SET status='running',attempts=attempts+1,lease_until=now()+interval '10 minutes',lease_token=$1 WHERE id=(SELECT id FROM lifecycle_jobs WHERE (status='queued' AND next_attempt_at<=now()) OR (status='running' AND lease_until<=now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *) SELECT * FROM claimed",[randomUUID()]));if(!j)return;
  try{
   await this.tx(async q=>{await this.owned(q,j);await q.query("UPDATE lifecycle_jobs SET phase='objects' WHERE id=$1",[j.id]);});
   const objects=(await this.db.query('SELECT * FROM wordmate.lifecycle_objects WHERE job_id=$1 AND deleted_at IS NULL',[j.id])).rows;
   for(const object of objects){
    if(object.kind==='spool'){
     ensure(this.audio?.spoolDir,503,'DELETE_STORAGE_NOT_CONFIGURED');ensure(/^[0-9a-f-]{36}-[1-5]\.mp3$/.test(object.object_key),500,'INVALID_DELETE_OBJECT');
     await unlink(join(this.audio!.spoolDir,object.object_key)).catch(e=>{if(e.code!=='ENOENT')throw e;});
    }else{
     const store=this.audio?.stores[object.profile];ensure(store?.delete,503,'DELETE_STORAGE_NOT_CONFIGURED');
     try{await store!.delete!(object.object_key);}catch(e){if((e as any)?.code!=='AUDIO_OBJECT_MISSING')throw e;}
    }
    await this.tx(async q=>{await this.owned(q,j);await q.query('UPDATE lifecycle_objects SET deleted_at=now() WHERE job_id=$1 AND kind=$2 AND profile=$3 AND object_key=$4',[j.id,object.kind,object.profile,object.object_key]);await q.query("UPDATE lifecycle_jobs SET lease_until=now()+interval '10 minutes' WHERE id=$1",[j.id]);});
   }
   await this.tx(async q=>{
    // Match the normal family -> children -> job lock order.
    await q.query('SELECT id FROM families WHERE id=$1 FOR UPDATE',[j.family_id]);await this.owned(q,j);
    await q.query("UPDATE lifecycle_jobs SET phase='records' WHERE id=$1",[j.id]);
    const children=j.kind==='delete_child'?[j.target_id]:(await q.query('SELECT id FROM children WHERE family_id=$1 ORDER BY id FOR UPDATE',[j.family_id])).rows.map(c=>c.id);
    for(const id of children)await this.removeChild(q,id);
    if(j.kind==='delete_family'){
     await q.query("DELETE FROM idempotency_keys WHERE position($1 in operation||coalesce(response_body::text,''))>0",[j.family_id]);
     await q.query('DELETE FROM family_invites WHERE family_id=$1',[j.family_id]);await q.query('DELETE FROM audit_logs WHERE family_id=$1',[j.family_id]);
     if((await one(q,"SELECT to_regclass('wordmate.ai_family_wallets') present"))?.present){const w=await one(q,'SELECT gift_remaining_micros FROM ai_family_wallets WHERE family_id=$1 FOR UPDATE',[j.family_id]);if(w&&Number(w.gift_remaining_micros)>0){await q.query("INSERT INTO ai_family_wallet_entries(family_id,user_id,kind,reference,amount_micros,gift_used_micros) VALUES($1,$2,'gift',$3,$4,$5) ON CONFLICT DO NOTHING",[j.family_id,j.requested_by,`family-close:${j.family_id}`,-Number(w.gift_remaining_micros),Number(w.gift_remaining_micros)]);await q.query('UPDATE ai_family_wallets SET balance_micros=balance_micros-gift_remaining_micros,gift_remaining_micros=0 WHERE family_id=$1',[j.family_id]);}}
     await q.query('DELETE FROM family_members WHERE family_id=$1',[j.family_id]);await q.query('DELETE FROM families WHERE id=$1',[j.family_id]);
    }
    await q.query("UPDATE lifecycle_jobs SET status='succeeded',phase='complete',completed_at=now(),error_code=NULL,lease_until=NULL,lease_token=NULL WHERE id=$1",[j.id]);
    await q.query('DELETE FROM lifecycle_objects WHERE job_id=$1',[j.id]);
    await q.query('UPDATE deletion_tombstones SET completed_at=now() WHERE (kind=$1 AND target_id=$2) OR (kind=\'delete_child\' AND target_id=ANY($3::uuid[]))',[j.kind,j.target_id,children]);
   });
  }catch(e){if((e as any)?.code==='DELETION_LEASE_LOST')return;
   const code=(e as any)?.code==='DELETE_STORAGE_NOT_CONFIGURED'?'DELETE_STORAGE_NOT_CONFIGURED':'DELETION_CLEANUP_FAILED';
   await this.db.query("UPDATE wordmate.lifecycle_jobs SET status='failed',error_code=$3,lease_until=NULL,lease_token=NULL WHERE id=$1 AND lease_token=$2 AND status='running'",[j.id,j.lease_token,code]);
  }
 }
 private async deleteUnstoredImages(q:Sql,where:string,id:string){ensure(!await one(q,`SELECT 1 FROM checkin_share_images WHERE ${where} AND storage_key IS NOT NULL AND storage_key NOT LIKE 'pool/%'`,[id]),503,'DELETE_STORAGE_NOT_CONFIGURED');await q.query(`DELETE FROM checkin_share_images WHERE ${where}`,[id]);}
 private async removeChild(q:Sql,id:string){
  const c=await one(q,'SELECT * FROM children WHERE id=$1 FOR UPDATE',[id]);if(!c)return;ensure(c.archived_at,409,'DELETION_NOT_FROZEN');
  const refs=[id];for(const table of ['wordbooks','batches','child_words','sentences','audio_assets','review_cards','study_sessions','generation_jobs','monthly_quizzes'])refs.push(...(await q.query(`SELECT id FROM ${table} WHERE child_id=$1`,[id])).rows.map(r=>r.id));
  await q.query("DELETE FROM idempotency_keys WHERE EXISTS(SELECT 1 FROM unnest($1::text[]) ref WHERE position(ref in operation||coalesce(response_body::text,''))>0)",[refs]);
  // Subscribers own independent word snapshots; detach them before deleting the source.
  await q.query('UPDATE wordbooks SET shared_source_id=NULL,shared_source_version=NULL,read_only=false WHERE shared_source_id IN (SELECT id FROM shared_wordbooks WHERE source_child_id=$1)',[id]);
  await q.query('DELETE FROM shared_wordbook_subscriptions WHERE child_id=$1 OR shared_wordbook_id IN (SELECT id FROM shared_wordbooks WHERE source_child_id=$1)',[id]);
  await q.query('UPDATE wordbooks SET shared_source_id=NULL,shared_source_version=NULL WHERE child_id=$1',[id]);
  await q.query('DELETE FROM shared_wordbook_items WHERE shared_wordbook_id IN (SELECT id FROM shared_wordbooks WHERE source_child_id=$1)',[id]);
  await q.query('DELETE FROM shared_wordbooks WHERE source_child_id=$1',[id]);
  if(this.images)await this.images.deleteChild(q,id);else await this.deleteUnstoredImages(q,"split_part(cache_scope,':',1)=$1",id);
  for(const table of ['study_session_items','mistake_events','daily_word_activity','review_logs','study_sessions','monthly_quiz_items','monthly_quizzes','word_corrections','word_annotations','audio_usage_events','audio_assets','generation_jobs','checkin_share_quotes','import_attempts','checkin_makeup_credits','daily_activity','sentence_targets','sentences','batch_items','batches','wordbook_words','review_cards','child_words','wordbooks'])await q.query(`DELETE FROM ${table} WHERE child_id=$1`,[id]);
  await q.query('DELETE FROM audit_logs WHERE target_id=ANY($1::uuid[])',[refs]);
  await q.query('DELETE FROM children WHERE id=$1',[id]);
 }
}
