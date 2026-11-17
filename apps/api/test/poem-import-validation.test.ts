import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateBody} from '../src/validation.ts';
const route=['children','child','poems','imports','job'],item={title:'春晓',author:'孟浩然',dynasty:'唐',body:'春眠不觉晓。'},draft={draft:item,key:'draft-1',saved:false,locked:false,issues:[],issuesReviewed:true},request_id='11000000-0000-4000-8000-000000000001';
const save=(body:any)=>validateBody([...route,'save'],'POST',body),sync=(body:any)=>validateBody([...route,'draft'],'PUT',body);
test('poem save accepts legacy requests and atomic batched requests used by the miniapp',()=>{
 assert.doesNotThrow(()=>save({items:[item]}));assert.doesNotThrow(()=>save({items:[item],request_id,expected_batch:0,remaining_batch:[]}));assert.doesNotThrow(()=>save({items:[item],request_id,expected_batch:1,remaining_batch:[draft]}));
});
test('batched poem saves reject incomplete receipts, unknown fields and invalid remaining drafts',()=>{
 const body={items:[item],request_id,expected_batch:0,remaining_batch:[]};
 for(const field of ['request_id','expected_batch','remaining_batch']){const invalid:any={...body};delete invalid[field];assert.throws(()=>save(invalid),{code:'INVALID_REQUEST_BODY'});}
 for(const invalid of [{...body,request_id:'bad'},{...body,expected_batch:-1},{...body,unexpected:true},{...body,remaining_batch:[{...draft,key:33}]},{...body,items:[{...item,body:''}]}])assert.throws(()=>save(invalid),{code:'INVALID_REQUEST_BODY'});
});
test('review drafts allow incomplete corrections but preserve field, issue and generation bounds',()=>{
 assert.doesNotThrow(()=>sync({batch:[draft],expected_batch:0}));assert.doesNotThrow(()=>sync({batch:[{...draft,draft:{title:'',author:'',dynasty:'',body:''}}],expected_batch:1}));
 for(const invalid of [{batch:[draft]},{batch:[{...draft,draft:{...item,body:'字'.repeat(1001)}}],expected_batch:0},{batch:[{...draft,issues:Array(7).fill('疑似问题')}],expected_batch:0},{batch:[],expected_batch:0,unexpected:true}])assert.throws(()=>sync(invalid),{code:'INVALID_REQUEST_BODY'});
});
