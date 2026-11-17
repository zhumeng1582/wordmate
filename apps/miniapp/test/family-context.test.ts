import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectFamilyContext,selectChildContext,reconcileFamilyChild,forgetChildContext} from '../src/services/family-context.ts';
test('family switch clears another familys child, and refresh never retains a removed child',()=>{
 const data=new Map<string,any>([['family_id','a'],['child_id','a-child']]),storage={get:(k:string)=>data.get(k),set:(k:string,v:any)=>{data.set(k,v);}};
 selectFamilyContext(storage,'a');assert.equal(storage.get('child_id'),'a-child');
 selectFamilyContext(storage,'b');assert.equal(storage.get('child_id'),'');
 assert.equal(reconcileFamilyChild(storage,[{id:'b-child'}])?.id,'b-child');assert.equal(storage.get('child_id'),'b-child');
 storage.set('child_id','b-child');assert.equal(reconcileFamilyChild(storage,[{id:'b-child'}])?.id,'b-child');
 reconcileFamilyChild(storage,[]);assert.equal(storage.get('child_id'),'');
});
test('default child selection preserves a valid choice and replaces a removed child',()=>{
 const data=new Map<string,any>([['child_id','second']]),storage={get:(k:string)=>data.get(k),set:(k:string,v:any)=>{data.set(k,v);}};
 assert.equal(reconcileFamilyChild(storage,[{id:'first'},{id:'second'}])?.id,'second');
 assert.equal(reconcileFamilyChild(storage,[{id:'first'}])?.id,'first');assert.equal(storage.get('child_id'),'first');
});
test('each family remembers its own selected child, and validates the remembered child',()=>{
 const data=new Map<string,any>([['access_token','account'],['family_id','a'],['child_id','a2']]);
 const storage={get:(k:string)=>data.get(k),set:(k:string,v:any)=>{data.set(k,v);}};
 selectFamilyContext(storage,'b');selectChildContext(storage,'b2');selectFamilyContext(storage,'a');
 assert.equal(reconcileFamilyChild(storage,[{id:'a1'},{id:'a2'}])?.id,'a2');
 selectFamilyContext(storage,'b');assert.equal(reconcileFamilyChild(storage,[{id:'b1'},{id:'b2'}])?.id,'b2');
 selectFamilyContext(storage,'a');assert.equal(reconcileFamilyChild(storage,[{id:'a1'}])?.id,'a1');
});
test('deleting one child preserves siblings learning queues and account preferences',()=>{
 const data=new Map<string,any>([['child_id','a'],['selected_child:account:f','a'],['study_resume:account:a',{progress:1}],['study_resume:account:b',{progress:2}],['audio:account',{auto:true}]]);
 const storage={get:(k:string)=>data.get(k),set:(k:string,v:any)=>{data.set(k,v);},remove:(k:string)=>{data.delete(k);},keys:()=>[...data.keys()]};
 forgetChildContext(storage,'a');assert.equal(data.get('child_id'),'');assert(!data.has('selected_child:account:f'));assert(!data.has('study_resume:account:a'));assert.deepEqual(data.get('study_resume:account:b'),{progress:2});assert(data.has('audio:account'));
});
