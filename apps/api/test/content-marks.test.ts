import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fixture} from './ai-fixture.ts';
import {validateBody} from '../src/validation.ts';
async function setup(){const f=await fixture();for(const name of ['024_textbook_sources.sql','025_new_sailing.sql','026_textbook_volumes.sql','028_word_tutor.sql','029_tutor_learning.sql',...readdirSync('apps/api/migrations').filter(n=>Number(n.slice(0,3))>=34).sort()])await f.pg.exec(readFileSync('apps/api/migrations/'+name,'utf8'));return f;}
test('favorite routes accept only boolean marks and a positive version',()=>{
 for(const kind of ['poems','hanzi']){
  const path=['children',randomUUID(),kind,randomUUID(),'favorite'];
  validateBody(path,'PUT',{favorite:true,expected_version:1});
  for(const body of [{favorite:'yes',expected_version:1},{favorite:true},{favorite:true,expected_version:0},{favorite:true,expected_version:1,important:true}])assert.throws(()=>validateBody(path,'PUT',body));
 }
});
test('child favorites are independent of mastery and importance, versioned and isolated from shared copies',async()=>{
 const f=await setup();try{
  // Applying again must preserve data and remain safe.
  const h=await f.core.hanzi.create(f.dad,randomUUID(),f.child.id,{character:'春'});
  const p=await f.core.poems.create(f.dad,randomUUID(),f.child.id,{title:'春晓',body:'春眠不觉晓。'});
  const marked=await f.core.hanzi.mark(f.dad,f.child.id,h.id,{important:true,expected_version:h.version});
  const learned=await f.core.poems.mark(f.dad,f.child.id,p.id,{memorized:true,expected_version:p.version});
  const hKey=randomUUID(),hBody={favorite:true,expected_version:marked.version};
  let hf=await f.core.hanzi.favorite(f.dad,hKey,f.child.id,h.id,hBody);
  assert.equal(hf.favorite,true);assert.equal(hf.important,true);assert.equal(hf.learned_at,null);
  assert.equal((await f.core.hanzi.favorite(f.dad,hKey,f.child.id,h.id,hBody)).version,hf.version);
  let pf=await f.core.poems.favorite(f.dad,randomUUID(),f.child.id,p.id,{favorite:true,expected_version:learned.version});
  assert.equal(String(pf.memorized_at),String(learned.memorized_at));
  for(const [module,id,row,code] of [[f.core.hanzi,h.id,hf,'HANZI_CHANGED'],[f.core.poems,p.id,pf,'POEM_CHANGED']] as const){
   await assert.rejects(module.favorite(f.dad,randomUUID(),f.child.id,id,{favorite:false,expected_version:row.version-1}),{code});
   await assert.rejects(module.favorite(f.mom,randomUUID(),f.child.id,id,{favorite:false,expected_version:row.version}),{code:'FAMILY_NOT_FOUND'});
  }
  await assert.rejects(f.core.hanzi.favorite(f.mom,hKey,f.child.id,h.id,hBody),{code:'FAMILY_NOT_FOUND'});
  assert.equal((await f.core.hanzi.list(f.dad,f.child.id,'favorite')).items.length,1);
  assert.equal((await f.core.poems.list(f.dad,f.child.id,0,'favorite')).items.length,1);
  hf=await f.core.hanzi.archive(f.dad,f.child.id,h.id,{archived:true,expected_version:hf.version});
  pf=await f.core.poems.archive(f.dad,f.child.id,p.id,{archived:true,expected_version:pf.version});
  assert.equal((await f.core.hanzi.list(f.dad,f.child.id,'favorite')).items.length,0);
  assert.equal((await f.core.poems.list(f.dad,f.child.id,0,'favorite')).items.length,0);
  hf=await f.core.hanzi.archive(f.dad,f.child.id,h.id,{archived:false,expected_version:hf.version});
  pf=await f.core.poems.archive(f.dad,f.child.id,p.id,{archived:false,expected_version:pf.version});
  assert(hf.favorite&&hf.important&&pf.favorite&&pf.memorized_at);
  await f.pg.exec(readFileSync('apps/api/migrations/060_library_favorites.sql','utf8'));
  assert.equal((await f.core.hanzi.get(f.dad,f.child.id,h.id)).favorite,true);
  const hb=(await f.core.hanzi.books(f.dad,f.child.id)).items[0],pb=(await f.core.poems.books.list(f.dad,f.child.id)).items[0];
  const hs=await f.core.hanzi.shareBook(f.dad,randomUUID(),f.child.id,hb.id,{published:true,title:'汉字',author:'老师'}),ps=await f.core.poems.books.share(f.dad,randomUUID(),f.child.id,pb.id,{published:true,title:'古诗',author:'老师'});
  for(const publicItem of [(await f.core.hanzi.shared(f.mom,hs.id)).items[0],(await f.core.poems.books.shared(f.mom,ps.id)).items[0]])assert(!('favorite' in publicItem));
  const child=await f.core.createChild(f.dad,randomUUID(),f.family.id,{nickname:'二宝'});
  const joinedH=await f.core.hanzi.joinShared(f.dad,randomUUID(),child.id,hs.id),joinedP=await f.core.poems.books.join(f.dad,randomUUID(),child.id,ps.id);
  const copyH=(await f.core.hanzi.list(f.dad,child.id,'all','','active',joinedH.id)).items[0],copyP=(await f.core.poems.list(f.dad,child.id,0,'all','','active',joinedP.id)).items[0];
  assert.equal(copyH.favorite,false);assert.equal((await f.core.poems.get(f.dad,child.id,copyP.id)).favorite,false);
  assert.equal((await f.core.hanzi.get(f.dad,child.id,copyH.id)).read_only,true);
  await f.core.hanzi.favorite(f.dad,randomUUID(),child.id,copyH.id,{favorite:true,expected_version:copyH.version});
  await f.core.poems.favorite(f.dad,randomUUID(),child.id,copyP.id,{favorite:true,expected_version:copyP.version});
  const freshH=await f.core.hanzi.get(f.dad,child.id,copyH.id);
  await f.core.hanzi.archive(f.dad,child.id,copyH.id,{archived:true,expected_version:freshH.version});
  await assert.rejects(f.core.hanzi.update(f.dad,child.id,copyH.id,{meaning:'改内容',expected_version:freshH.version}),{code:'SHARED_WORDBOOK_READ_ONLY'});
  assert.equal((await f.core.hanzi.get(f.dad,f.child.id,h.id)).library_archived_at,null);
 }finally{await f.close();}
});
