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
async function fixture(){
 const pg=new PGlite();
 for(const file of ['deliverables/0.1/database/001_schema.sql','apps/api/migrations/056_import_order.sql','apps/api/migrations/043_library_archive.sql','apps/api/migrations/016_security_integrity.sql','apps/api/migrations/019_parent_profiles.sql'])await pg.exec(readFileSync(file,'utf8'));
 const db:Database={query:(s,p)=>pg.query(s,p),transaction:fn=>pg.transaction((tx:any)=>fn({query:(s,p)=>tx.query(s,p)}))};
 const core=new Core(db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'family-management');
 const dad=(await core.login('dev-dad')).user.id,mom=(await core.login('dev-mom')).user.id,other=(await core.login('dev-outsider')).user.id;
 const family=await core.createFamily(dad,randomUUID(),{name:'家庭'});
 const invite=()=>core.createInvite(dad,randomUUID(),family.id);
 return {pg,core,dad,mom,other,family,invite};
}
test('child editing preserves learning data, enforces owner and version, and replays safely',async()=>{
 const f=await fixture();try{
  const a=await f.core.createChild(f.dad,randomUUID(),f.family.id,{nickname:'大宝'}),b=await f.core.createChild(f.dad,randomUUID(),f.family.id,{nickname:'二宝'});
  const book=await f.core.createWordbook(f.dad,randomUUID(),a.id,{name:'原词本'});
  const body={nickname:' 大宝新昵称 ',school_grade:'小学二年级',gender:'girl',expected_version:a.version},key=randomUUID();
  validateBody(['children',a.id],'PATCH',body);
  const saved=await f.core.updateChild(f.dad,key,a.id,body);assert.equal(saved.nickname,'大宝新昵称');assert.equal(saved.version,a.version+1);assert.equal(saved.daily_goal,a.daily_goal);
  assert.deepEqual(await f.core.updateChild(f.dad,key,a.id,body),saved);assert.equal((await f.core.wordbooks(f.dad,a.id)).items[0].id,book.id);
  assert.equal((await f.core.children(f.dad,f.family.id)).items.find((c:any)=>c.id===b.id).nickname,'二宝');
  await assert.rejects(f.core.updateChild(f.dad,randomUUID(),a.id,body),{code:'CHILD_CHANGED'});
  await assert.rejects(f.core.updateChild(f.other,randomUUID(),a.id,{...body,expected_version:saved.version}),{code:'FAMILY_NOT_FOUND'});
  const i=await f.invite();await f.core.claimInvite(f.mom,randomUUID(),{invite_token:i.invite_token});await f.core.approveInvite(f.dad,randomUUID(),i.id);
  await assert.rejects(f.core.updateChild(f.mom,randomUUID(),a.id,{...body,expected_version:saved.version}),{code:'OWNER_REQUIRED'});
  await assert.rejects(f.core.updateChild(f.dad,randomUUID(),a.id,{...body,nickname:'  '}),{code:'INVALID_CHILD_PROFILE'});
  await assert.rejects(f.core.updateChild(f.dad,randomUUID(),a.id,{...body,school_grade:'\n坏数据\u0000'}),{code:'INVALID_CHILD_PROFILE'});
  assert.throws(()=>validateBody(['children',a.id],'PATCH',{...body,family_id:randomUUID()}));
 }finally{await f.pg.close();}
});
for(const action of ['reject','revoke','cancel'] as const)test(`${action} blocks later approval without adding or removing members`,async()=>{
 const f=await fixture();try{
  const i=await f.invite();await f.core.claimInvite(f.mom,randomUUID(),{invite_token:i.invite_token});
  const actor=action==='cancel'?f.mom:f.dad,key=randomUUID();validateBody(['family-invites',i.id,action],'POST',{});
  await assert.rejects(f.core.changeInvite(f.other,randomUUID(),i.id,action),{code:action==='cancel'?'INVITE_NOT_FOUND':'FAMILY_NOT_FOUND'});
  const saved=await f.core.changeInvite(actor,key,i.id,action);assert.equal(saved.status,action==='reject'?'rejected':'revoked');
  assert.deepEqual(await f.core.changeInvite(actor,key,i.id,action),JSON.parse(JSON.stringify(saved)));
  await assert.rejects(f.core.approveInvite(f.dad,randomUUID(),i.id),{code:'INVITE_UNAVAILABLE'});
  assert.equal((await f.core.resolveInvite(f.mom,{invite_token:i.invite_token})).state,'unavailable');
  assert.equal((await f.core.me(f.mom)).family_applications.length,0);assert.equal((await f.core.members(f.dad,f.family.id)).items.length,1);
 }finally{await f.pg.close();}
});
test('approval wins before cancellation; active invitations can be revoked before use',async()=>{
 const f=await fixture();try{
  const unused=await f.invite();await f.core.changeInvite(f.dad,randomUUID(),unused.id,'revoke');await assert.rejects(f.core.claimInvite(f.other,randomUUID(),{invite_token:unused.invite_token}),{code:'INVITE_UNAVAILABLE'});
  const i=await f.invite();await f.core.claimInvite(f.mom,randomUUID(),{invite_token:i.invite_token});
  assert.equal((await f.core.resolveInvite(f.mom,{invite_token:i.invite_token}) as any).application_id,i.id);
  await f.core.approveInvite(f.dad,randomUUID(),i.id);
  for(const action of ['cancel','reject','revoke'] as const)await assert.rejects(f.core.changeInvite(action==='cancel'?f.mom:f.dad,randomUUID(),i.id,action),{code:'INVITE_UNAVAILABLE'});
  assert.equal((await f.core.members(f.dad,f.family.id)).items.length,2);
  await assert.rejects(f.core.changeInvite(f.mom,randomUUID(),unused.id,'revoke'),{code:'OWNER_REQUIRED'});
 }finally{await f.pg.close();}
});
