import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick} from './page-harness.ts';
const item={id:'p',title:'画鸡',body:'头上红冠不用裁。',version:1,memorized_at:'2026-11-01',library_archived_at:null};
const setup=(confirm=true)=>pageHarness('pages/poems/index',async()=>item,undefined,{...{props:{detailId:'p'}},confirm});
test('诗词 content tools are visible beside favorite while learning marks alone expand',async()=>{
 const p=setup();await p.show();const initialWrites=p.calls.filter(c=>c.method!=='GET').length;assert(p.button('编辑内容'));assert(p.button('删除诗词'));assert(!p.all(p.render()).some(n=>n.props?.['aria-label']==='诗词更多操作'));assert.equal(p.button('收藏诗词').disabled,false);assert.equal(p.actionSheets.length,0);assert.equal(p.calls.filter(c=>c.method!=='GET').length,initialWrites);p.button('标记诗词').onClick();assert(p.button('标记已掌握'));assert(p.button('编辑内容'));assert(p.button('删除诗词'));p.button('标记诗词').onClick();assert(!p.all(p.render()).some(n=>n.props?.className==='content-actions-panel'));p.dispose();
});
for(const confirm of [false,true])test(`诗词 deletion confirmation ${confirm}`,async()=>{const p=setup(confirm);await p.show();await p.button('删除诗词').onClick();await tick();assert.equal(p.modals.length,1);assert.equal(p.calls.filter(c=>c.method==='DELETE').length,confirm?1:0);p.dispose();});
for(const change of ['hide','child','account'])test(`诗词 rejects stale inline actions after ${change}`,async()=>{const p=setup();await p.show();const select=p.button('删除诗词').onClick;if(change==='hide')p.hide();else p.cache.set(change==='child'?'child_id':'access_token','changed');select();await tick();assert(!p.calls.some(c=>c.method==='DELETE'||c.method==='PUT'));assert.equal(p.modals.length,0);p.dispose();});
