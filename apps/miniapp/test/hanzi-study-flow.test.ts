import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick} from './page-harness.ts';
import {roundFixture} from './hanzi-round-fixture.ts';
import {hanziStudyQuestion,mergeHanziFlow,advanceHanziFlow} from '../src/services/hanzi-study-flow.ts';
const cards=[['春','chūn','春天'],['夏','xià','夏天'],['秋','qiū','秋天'],['冬','dōng','冬天']].map(([character,pinyin,words],i)=>({id:'h'+i,ordinal:i+1,hanzi_id:'h'+i,character,pinyin,words,meaning:words,example:words+'来了。',learned_at:null}));
const answers=(page:any)=>page.calls.filter((c:any)=>c.path.endsWith('/answer'));

test('new characters learn the whole group, then automatically record the first test and practice mistakes without re-scoring',async()=>{
 const page=pageHarness('pages/hanzi-study/index',roundFixture(async()=>({items:cards})),undefined,{query:{source:'new'}});await page.show();page.button('开始学习').onClick();await tick();
 for(let i=0;i<3;i++){assert.match(page.text(page.render()),/先认识这一组汉字/);page.button('下一个').onClick();}
 assert.equal(answers(page).length,0);assert(!page.all(page.render()).some(n=>n.type==='Button'&&page.text(n).includes('标记已学')));
 page.button('开始测试').onClick();assert(!page.all(page.render()).some(n=>n.props?.className==='hanzi-study-answer'));
 for(let i=0;i<4;i++){page.button(i===0?'xià':cards[i].pinyin).onClick();await tick();assert.equal(answers(page).length,i+1);assert.equal(answers(page)[i].body.action,'learn');assert.equal(answers(page)[i].body.correct,i!==0);page.button('下一题').onClick();}
 assert.match(page.text(page.render()),/正确 3 · 答错 1/);page.button('巩固错字').onClick();page.button('xià').onClick();page.button('下一题').onClick();assert.match(page.text(page.render()),/巩固第/);page.button('chūn').onClick();page.button('下一题').onClick();
 assert.equal(answers(page).length,4);assert.match(page.text(page.render()),/正确 3 · 答错 1/);page.dispose();
});

test('review starts with a test and preserves study phase after leaving and resuming',async()=>{
 const read=roundFixture(async()=>({items:cards.map(c=>({...c,learned_at:'2026-11-12'}))}));
 const page=pageHarness('pages/hanzi-study/index',read,undefined,{query:{source:'review'}});await page.show();page.button('开始复习').onClick();await tick();
 assert.match(page.text(page.render()),/测试第 1/);assert(!page.all(page.render()).some(n=>n.props?.className==='hanzi-study-answer'));page.button('chūn').onClick();await tick();page.button('下一题').onClick();
 page.hide();await tick();await page.show();page.button('继续上次学习').onClick();await tick();assert.match(page.text(page.render()),/测试第 2/);assert(!page.all(page.render()).some(n=>n.type==='Button'&&page.text(n)==='开始测试'));
 page.button('xià').onClick();await tick();assert.equal(answers(page).length,2);assert(answers(page).every((call:any)=>call.body.action==='review'));page.dispose();
});

test('stale character test buttons cannot write to another child',async()=>{
 const page=pageHarness('pages/hanzi-study/index',roundFixture(async()=>({items:cards})),undefined,{query:{source:'new'}});await page.show();page.button('开始学习').onClick();await tick();for(let i=0;i<3;i++)page.button('下一个').onClick();page.button('开始测试').onClick();const button=page.button('chūn');page.cache.set('child_id','other');button.onClick();await tick();assert.equal(answers(page).length,0);assert(!page.cache.has('hanzi-flow:account-a:other'));page.dispose();
});

test('question choices are exclusive and unsupported pronunciations use words or self-check',()=>{
 const duplicate=hanziStudyQuestion(cards[0],[cards[0],{...cards[1],pinyin:'CHŪN'},{...cards[2],pinyin:'qiū'}],'stable');assert.equal(new Set(duplicate.options).size,duplicate.options.length);assert.equal(duplicate.options.filter(o=>o==='chūn').length,1);
 const polyphonic={...cards[0],character:'行',pinyin:'xíng / háng',words:'行走、银行'};
 const question=hanziStudyQuestion(polyphonic,[polyphonic,...cards],'words');assert.equal(question.kind,'words');assert.equal(question.options.filter(o=>o.includes('行')).length,1);
 assert.equal(hanziStudyQuestion({...polyphonic,words:''},[],'empty').kind,'self');
 const r={id:'r',source:'new',status:'in_progress',items:cards,current:cards[0],answered_count:0};const flow=mergeHanziFlow(null,r);assert.equal(flow.phase,'learn');assert.equal(mergeHanziFlow(flow,{...r,status:'completed',items:[],current:null,answered_count:4}).phase,'summary');
});

test('large rounds summarize each batch before continuing without retaining every prior card',()=>{
 const first=cards[0],next={...cards[1],ordinal:101};
 const round={id:'large',source:'history',status:'in_progress',items:[next],current:next,answered_count:100};
 const flow={...mergeHanziFlow(null,{...round,items:[first],current:first,answered_count:0}),results:{1:{card:first,correct:false,selected:'xià'}}};
 const summary=advanceHanziFlow(flow,round);assert.equal(summary.phase,'summary');assert.equal(summary.cards[0].ordinal,1);
 const continued=mergeHanziFlow(null,round);assert.equal(continued.phase,'test');assert.equal(continued.cards[0].ordinal,101);assert.equal(Object.keys(continued.results).length,0);
});
