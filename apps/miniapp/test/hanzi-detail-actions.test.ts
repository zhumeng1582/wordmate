import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick} from './page-harness.ts';
const item={id:'h',character:'地',version:1,learned_at:'2026-11-01',library_archived_at:null,important:false};
const setup=(confirm=true)=>pageHarness('pages/hanzi-detail/index',async()=>item,undefined,{...{query:{id:'h'}},confirm});
test('汉字 content tools are visible beside favorite while learning marks alone expand',async()=>{
 const p=setup();await p.show();const initialWrites=p.calls.filter(c=>c.method!=='GET').length;assert(p.button('编辑内容'));assert(p.button('删除汉字'));assert(!p.all(p.render()).some(n=>n.props?.['aria-label']==='汉字更多操作'));assert.equal(p.button('收藏汉字').disabled,false);assert.equal(p.actionSheets.length,0);assert.equal(p.calls.filter(c=>c.method!=='GET').length,initialWrites);p.button('标记汉字').onClick();assert(p.button('标记已掌握'));assert(p.button('编辑内容'));assert(p.button('删除汉字'));p.button('标记汉字').onClick();assert(!p.all(p.render()).some(n=>n.props?.className==='content-actions-panel'));p.dispose();
});
for(const confirm of [false,true])test(`汉字 deletion confirmation ${confirm}`,async()=>{const p=setup(confirm);await p.show();await p.button('删除汉字').onClick();await tick();assert.equal(p.modals.length,1);assert.equal(p.calls.filter(c=>c.method==='DELETE').length,confirm?1:0);p.dispose();});
for(const change of ['hide','child','account'])test(`汉字 rejects stale inline actions after ${change}`,async()=>{const p=setup();await p.show();const select=p.button('删除汉字').onClick;if(change==='hide')p.hide();else p.cache.set(change==='child'?'child_id':'access_token','changed');select();await tick();assert(!p.calls.some(c=>c.method==='DELETE'||c.method==='PUT'));assert.equal(p.modals.length,0);p.dispose();});
