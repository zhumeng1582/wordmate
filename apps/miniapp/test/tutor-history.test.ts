import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick} from './page-harness.ts';
test('AI 学童 history combines types in time order, filters and opens the correct session',async()=>{
 const p=pageHarness('pages/word-tutor/index',async path=>path.endsWith('/word-tutor-sessions')?{items:[{id:'w',lemma:'apple',updated_at:'2026-01-01',last_message:'word answer'}]}:path.endsWith('/poem-tutor-sessions')?{items:[{id:'s',poem_id:'p',title:'春晓',updated_at:'2026-02-01',last_message:'poem answer'}]}:{},undefined);
 await tick();await tick();const t=p.text(p.render());assert(t.indexOf('春晓')<t.indexOf('apple'));assert.match(t,/诗词 · 春晓/);assert.match(t,/单词 · apple/);p.button('诗词').onClick();assert.doesNotMatch(p.text(p.render()),/apple/);p.button('春晓').onClick();assert.equal(p.routes.at(-1),'/pages/poem-chat/index?poem=p&session=s');p.button('单词').onClick();p.button('apple').onClick();assert.equal(p.routes.at(-1),'/pages/word-tutor/index?session=w');p.dispose();
});
test('historical poem session opens without creating or regenerating it',async()=>{
 const page=pageHarness('pages/poem-chat/index',async(path,method)=>path.endsWith('/sessions/s')?{id:'s',title:'旧标题',messages:[{id:'m',role:'assistant',content:'旧聊天'}]}:path.endsWith('/p')?{title:'新标题'}:{},undefined,{query:{poem:'p',session:'s'}});await tick();await tick();assert.match(page.text(page.render()),/旧标题/);assert.match(page.text(page.render()),/旧聊天/);assert(page.calls.every(x=>x.method==='GET'));page.dispose();
});
