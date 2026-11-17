import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness} from './page-harness.ts';
test('recommendations follow only the last assistant reply, send its text and hide while waiting',()=>{
 let sent='';const messages=[{id:'old',role:'assistant',suggestions:['旧问题']},{id:'u',role:'user'},{id:'new',role:'assistant',suggestions:['这句话中的大同是什么意思','用生活里的例子说明','围绕这段话考考我']}];
 const page=pageHarness('components/ChatSuggestions',async()=>({}),'ChatSuggestions',{props:{messages,onSend:(q:string)=>{sent=q;}}});const text=page.text(page.render());assert(!text.includes('旧问题'));page.button('用生活里的例子说明').onClick();assert.equal(sent,'用生活里的例子说明');assert.equal(page.all(page.render()).filter(n=>n.type==='Button').length,3);page.dispose();
 for(const props of [{messages,busy:true},{messages:[...messages,{role:'user'}]},{messages:[{role:'assistant'}]}]){const hidden=pageHarness('components/ChatSuggestions',async()=>({}),'ChatSuggestions',{props:{...props,onSend:()=>{}}});assert.equal(hidden.render(),null);hidden.dispose();}
});
