import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred} from './page-harness.ts';
const cases=[
 {kind:'hanzi',name:'汉字',page:'hanzi-detail',item:{id:'h',character:'春',version:3,important:true,learned_at:'2026-11-01',library_archived_at:null},query:{id:'h'}},
 {kind:'poems',name:'诗词',page:'poems',item:{id:'p',title:'春晓',body:'春眠不觉晓。',version:3,memorized_at:'2026-11-01',library_archived_at:null},props:{detailId:'p'}},
 {kind:'sentences',name:'句子',page:'sentence-detail',item:{sentence_id:'s',text_en:'Good morning.',translation_zh:'早上好。',version:3,state:'learning',archived_at:null},query:{id:'s'}}
];
for(const c of cases){
 const setup=(options:any={},write?:(body:any)=>any)=>{let item:any={...c.item,favorite:false};return pageHarness(`pages/${c.page}/index`,async(path,method,body)=>{if(['PUT','PATCH'].includes(method)){item=write?await write(body):{...item,...body,version:item.version+1};return item;}return c.kind==='sentences'?{items:[item],book:{read_only:true}}:item;},undefined,{query:c.query,props:c.props,...options});};
 test(`${c.kind} favorite toggles once and preserves learning marks`,async()=>{
  const gate=deferred(),p=setup({},()=>gate.promise);await p.show();const favorite=p.button(`收藏${c.name}`).onClick;favorite();favorite();await tick();assert.equal(p.calls.filter(v=>['PUT','PATCH'].includes(v.method)).length,1);
  gate.resolve({...c.item,favorite:true,version:4});await tick();assert(p.button(`取消收藏${c.name}`));assert.match(p.text(p.render()),/学习中/);if(c.kind==='hanzi')assert.match(p.text(p.render()),/重点字/);p.dispose();
 });
 test(`${c.kind} favorite error keeps original state and scope changes discard results`,async()=>{
  const p=setup({},()=>{throw Error('保存失败');});await p.show();await p.button(`收藏${c.name}`).onClick();await tick();assert(p.button(`收藏${c.name}`));assert.match(p.text(p.render()),/保存失败/);p.dispose();
  const gate=deferred(),late=setup({},()=>gate.promise);await late.show();late.button(`收藏${c.name}`).onClick();await tick();late.hide();late.cache.set('child_id','other');gate.resolve({...c.item,favorite:true,version:4});await tick();assert(!late.all(late.render()).some(n=>n.props?.['aria-label']===`取消收藏${c.name}`));late.dispose();
 });
 test(`${c.kind} mastery explains the effect and cancelling saves nothing`,async()=>{
  const p=setup({actionChoices:['标记已掌握'],confirm:false});await p.show();p.button(`标记${c.name}`).onClick();await tick();assert.equal(p.actionSheets.length,0);assert.equal(p.button(`标记${c.name}`).disabled,false);p.button('标记已掌握').onClick();await tick();assert.equal(p.modals.length,1);assert.match(p.modals[0].content,/原有学习记录会保留/);assert(!p.calls.some(v=>['PUT','PATCH'].includes(v.method)));assert.match(p.text(p.render()),/学习中/);assert.equal(p.button(`标记${c.name}`).disabled,false);p.dispose();
 });
 test(`${c.kind} return reloads updated favorite and read-only hides content editing`,async()=>{
  let changed=false;const p=pageHarness(`pages/${c.page}/index`,async()=>{const item={...c.item,favorite:changed,read_only:true};return c.kind==='sentences'?{items:[item],book:{read_only:true}}:item;},undefined,{query:c.query,props:c.props});await p.show();assert(!p.all(p.render()).some(n=>n.props?.['aria-label']==='编辑内容'||String(n.props?.['aria-label']||'').startsWith('删除')));p.hide();changed=true;await p.show();assert(p.button(`取消收藏${c.name}`));p.dispose();
 });
}
test('word detail uses the shared actions while preserving its safe annotation star',async()=>{
 const p=pageHarness('pages/word-detail/index',async path=>path.endsWith('/annotations')?{favorite:true,version:2}:{id:'w',lemma:'spring',version:1},undefined,{query:{id:'w'}});await p.show();assert(p.button('标记单词'));assert(p.button('标记待纠错'));assert(!p.all(p.render()).some(n=>n.props?.['aria-label']==='单词更多操作'));const favorite=p.all(p.render()).find(n=>n.type==='FavoriteButton');assert.equal(favorite.props.compact,false);assert.equal(favorite.props.initial.favorite,true);p.dispose();
});
test('word favorite cannot write after hide, child switch or a late annotation response',async()=>{
 for(const change of ['hide','child']){const gate=deferred();const p=pageHarness('components/FavoriteButton',async()=>gate.promise,'FavoriteButton',{props:{wordId:'w',initial:{favorite:false,version:1}}});p.button('收藏单词').onClick({stopPropagation(){}});if(change==='hide')p.hide();else p.cache.set('child_id','other');gate.resolve({favorite:false,version:2});await tick();assert(!p.calls.some(v=>v.method==='PATCH'));p.dispose();}
});
