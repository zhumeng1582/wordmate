import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectFamilyContext,reconcileFamilyChild} from '../src/services/family-context.ts';
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
