import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {Core} from '../src/core.ts';
import {DevIdentity,FixtureDictionary,createScheduler} from '../src/providers.ts';
import {validateBody} from '../src/validation.ts';
import type {Database} from '../src/ports.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');
const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5xkAAAAASUVORK5CYII=';
async function fixture(){
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/016_security_integrity.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/019_parent_profiles.sql','utf8'));
 const db:Database={query:(sql,params)=>pg.query(sql,params),transaction:fn=>pg.transaction((tx:any)=>fn({query:(sql,params)=>tx.query(sql,params)}))};
 const core=new Core(db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'profiles'),dad=await core.login('dev-dad'),mom=await core.login('dev-mom'),other=await core.login('dev-outsider'),family=await core.createFamily(dad.user.id,randomUUID(),{name:'共学家庭'});
 return {pg,core,dad,mom,other,family};
}
test('parent profile saves only explicit names and bounded images, with version and retry protection',async()=>{
 const f=await fixture();try{
  const request={display_name:'小明爸爸',expected_version:1,avatar_base64:image,avatar_mime:'image/png'},key=randomUUID(),saved=await f.core.saveProfile(f.dad.user.id,key,request);
  assert.equal(saved.display_name,'小明爸爸');assert.equal(saved.version,2);assert.match(saved.avatar_path!,/\/avatar\?v=1$/);assert(!JSON.stringify(saved).includes(image));
  assert.equal(f.dad.is_new_user,true);const returning=await f.core.login('dev-dad');assert.equal(returning.is_new_user,false);assert.deepEqual(returning.user,saved);
  assert.deepEqual(await f.core.saveProfile(f.dad.user.id,key,request),saved);assert.equal((await f.core.me(f.dad.user.id)).user.avatar_path,saved.avatar_path);
  assert.equal((await f.core.members(f.dad.user.id,f.family.id)).items[0].display_name,'小明爸爸');assert.equal((await f.core.members(f.dad.user.id,f.family.id)).items[0].is_self,true);
  assert.equal((await f.core.parentAvatar(f.dad.user.id,f.dad.user.id,'1')).bytes.toString('base64'),image);
  await assert.rejects(f.core.saveProfile(f.dad.user.id,randomUUID(),{display_name:'过期修改',expected_version:1}),{code:'PROFILE_CHANGED'});
  await assert.rejects(f.core.saveProfile(f.dad.user.id,randomUUID(),{display_name:'无效头像',expected_version:2,avatar_base64:'PHN2Zz4=',avatar_mime:'image/svg+xml'}),{code:'INVALID_AVATAR'});
  const removed=await f.core.saveProfile(f.dad.user.id,randomUUID(),{display_name:'小明爸爸',expected_version:2,remove_avatar:true});assert.equal(removed.avatar_path,null);await assert.rejects(f.core.parentAvatar(f.dad.user.id,f.dad.user.id),{code:'AVATAR_NOT_FOUND'});
 }finally{await f.pg.close();}
});
test('invitation states are visible before membership and avatar access is restricted to the family',async()=>{
 const f=await fixture();try{
  await f.core.saveProfile(f.mom.user.id,randomUUID(),{display_name:'小明妈妈',expected_version:1,avatar_base64:image,avatar_mime:'image/png'});
  await assert.rejects(f.core.parentAvatar(f.dad.user.id,f.mom.user.id),{code:'AVATAR_NOT_FOUND'});
  const invite=await f.core.createInvite(f.dad.user.id,randomUUID(),f.family.id);assert.equal((await f.core.invites(f.dad.user.id,f.family.id)).items[0].status,'pending');assert.equal((await f.core.members(f.dad.user.id,f.family.id)).items.length,1);
  const claim=await f.core.claimInvite(f.mom.user.id,randomUUID(),{invite_token:invite.invite_token});const applications=(await f.core.me(f.mom.user.id)).family_applications;assert.equal(applications[0].family_name,'共学家庭');assert.equal(applications[0].id,claim.id);
  const request=(await f.core.invites(f.dad.user.id,f.family.id)).items[0];assert.equal(request.applicant_profile?.display_name,'小明妈妈');assert.equal((await f.core.parentAvatar(f.dad.user.id,f.mom.user.id)).mime,'image/png');
  await assert.rejects(f.core.parentAvatar(f.other.user.id,f.mom.user.id),{code:'AVATAR_NOT_FOUND'});
  await f.core.approveInvite(f.dad.user.id,randomUUID(),claim.id);assert.equal((await f.core.me(f.mom.user.id)).family_applications.length,0);assert.equal((await f.core.members(f.mom.user.id,f.family.id)).items.length,2);
  await f.pg.query("UPDATE wordmate.family_members SET status='left' WHERE family_id=$1 AND user_id=$2",[f.family.id,f.mom.user.id]);await assert.rejects(f.core.parentAvatar(f.dad.user.id,f.mom.user.id),{code:'AVATAR_NOT_FOUND'});
 }finally{await f.pg.close();}
});
test('profile route rejects extra identity fields and malformed names before a write',()=>{
 validateBody(['me','profile'],'PUT',{display_name:'家长',expected_version:1});
 for(const payload of [{display_name:'家长',expected_version:1,user_id:randomUUID()},{display_name:'bad\nname',expected_version:1},{display_name:'',expected_version:1},{display_name:'家长',expected_version:0}])assert.throws(()=>validateBody(['me','profile'],'PUT',payload));
});
test('invitation routing prioritizes active membership even on expired or consumed cards',async()=>{
 const f=await fixture();try{
  const child=await f.core.createChild(f.dad.user.id,randomUUID(),f.family.id,{nickname:'宝宝'}),invite=await f.core.createInvite(f.dad.user.id,randomUUID(),f.family.id);
  assert.equal((await f.core.resolveInvite(f.mom.user.id,{invite_token:invite.invite_token})).state,'ready');
  await f.core.claimInvite(f.mom.user.id,randomUUID(),{invite_token:invite.invite_token});assert.equal((await f.core.resolveInvite(f.mom.user.id,{invite_token:invite.invite_token})).state,'waiting');
  assert.deepEqual(await f.core.resolveInvite(f.other.user.id,{invite_token:invite.invite_token}),{state:'unavailable'});
  await f.core.approveInvite(f.dad.user.id,randomUUID(),invite.id);
  await f.pg.query("UPDATE wordmate.family_invites SET created_at=now()-interval '48 hours',expires_at=now()-interval '24 hours' WHERE id=$1",[invite.id]);
  for(const user of [f.dad,f.mom]){const result=await f.core.resolveInvite(user.user.id,{invite_token:invite.invite_token});assert.equal(result.state,'member');assert.equal(result.family?.id,f.family.id);assert.deepEqual(result.children,[{id:child.id}]);}
  assert.deepEqual(await f.core.resolveInvite(f.other.user.id,{invite_token:invite.invite_token}),{state:'unavailable'});
  await f.pg.query("UPDATE wordmate.family_members SET status='left' WHERE family_id=$1 AND user_id=$2",[f.family.id,f.mom.user.id]);assert.equal((await f.core.resolveInvite(f.mom.user.id,{invite_token:invite.invite_token})).state,'unavailable');
  await f.pg.query("UPDATE wordmate.families SET status='deleting' WHERE id=$1",[f.family.id]);assert.equal((await f.core.resolveInvite(f.dad.user.id,{invite_token:invite.invite_token})).state,'unavailable');
 }finally{await f.pg.close();}
});
test('multiple cards for the same family reuse the existing pending application',async()=>{
 const f=await fixture();try{
  const first=await f.core.createInvite(f.dad.user.id,randomUUID(),f.family.id),second=await f.core.createInvite(f.dad.user.id,randomUUID(),f.family.id);
  const application=await f.core.claimInvite(f.mom.user.id,randomUUID(),{invite_token:first.invite_token});
  assert.equal((await f.core.resolveInvite(f.mom.user.id,{invite_token:second.invite_token})).state,'waiting');
  assert.equal((await f.core.claimInvite(f.mom.user.id,randomUUID(),{invite_token:second.invite_token})).id,application.id);
  assert.equal((await f.core.me(f.mom.user.id)).family_applications.length,1);assert.equal((await f.core.members(f.dad.user.id,f.family.id)).items.length,1);
  assert.deepEqual(await f.core.resolveInvite(f.mom.user.id,{invite_token:'z'.repeat(43)}),{state:'unavailable'});await assert.rejects(f.core.resolveInvite(f.mom.user.id,{invite_token:'malformed'}),{code:'INVALID_REQUEST_BODY'});
 }finally{await f.pg.close();}
});
