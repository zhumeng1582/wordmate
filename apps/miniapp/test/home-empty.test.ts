import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred} from './page-harness.ts';
import {homeEmptyState} from '../src/services/home-content.ts';
import type {LibraryKind} from '../src/services/library-navigation.ts';
const kinds:LibraryKind[]=['words','poems','hanzi','sentences'];
const fields={words:'word_count',poems:'poem_count',hanzi:'hanzi_count',sentences:'sentence_count'};
const names={words:'单词',poems:'古诗',hanzi:'汉字',sentences:'句子'};
const ids={words:'book-a',poems:'p-a',hanzi:'h-a',sentences:'book-a'};
const card=(p:any,kind:string)=>p.all(p.render()).find((n:any)=>n.props?.['data-kind']===kind);
function fixture(){
 const totals:Record<LibraryKind,number>={words:0,poems:0,hanzi:0,sentences:0};
 const books=Object.fromEntries(kinds.map(kind=>[kind,[{id:ids[kind],name:'当前词本',[fields[kind]]:0}]])) as Record<LibraryKind,any[]>;
 const read=async(path:string)=>{
  if(path==='/me')return {families:[{id:'family-a'}]};
  for(const kind of kinds)if(path.endsWith('/'+({words:'wordbooks',poems:'poem-books',hanzi:'hanzi-books',sentences:'sentence-books'}[kind])))return {items:books[kind]};
  if(path.includes('/today'))return {child:{id:'child-a',nickname:'豆芽'},wordbook:{id:'book-a',name:'当前词本'},goal:10,completed_words:0,new_count:totals.words,due_count:0};
  if(path.includes('/words?'))return {book_total:totals.words,learned_count:0,overall_total:totals.words,overall_learned_count:0};
  if(path.includes('/hanzi?'))return {total:totals.hanzi,learned_count:0,overall_total:totals.hanzi,overall_learned_count:0};
  if(path.includes('/poems?'))return {total:totals.poems,memorized_count:0,overall_total:totals.poems,overall_learned_count:0};
  if(path.includes('/sentences?'))return {total:totals.sentences,learned:0};
  if(path.includes('-progress'))return {completed:0,goal:10,daily_goal:5,new_count:path.includes('sentence')?totals.sentences:totals.hanzi,due_count:0,checked_in:false};
  if(path.endsWith('/hanzi-study-rounds'))return {round:null};
  return {poems:{checked_in:false,total_days:0},hanzi:{checked_in:false,total_days:0}};
 };
 return {totals,books,read};
}
test('empty detection includes mastered content and requires evidence across every book',()=>{
 for(const kind of kinds){assert.equal(homeEmptyState(kind,9,[],''),null);assert.equal(homeEmptyState(kind,null,[],''),null);assert.equal(homeEmptyState(kind,0,[],''),'empty');assert.equal(homeEmptyState(kind,0,[{id:'a',name:'本'},{id:'b',name:'未知本'}],'a'),'empty-book');assert.equal(homeEmptyState(kind,0,[{id:'a',name:'本'},{id:'b',name:'空本',[fields[kind]]:0}],'a'),'empty');assert.equal(homeEmptyState(kind,0,[{id:'b',name:'已有内容',[fields[kind]]:12}],'a'),'empty-book');}
});
test('new child home offers scoped import/discovery without goals or check-in; visibility and order persist',async()=>{
 const f=fixture(),p=pageHarness('pages/home/index',f.read,undefined,{cache:{'home_sections:account-a':{words:true,poems:true,hanzi:true,sentences:false},'home_section_order:account-a':['hanzi','words','poems','sentences']}});await p.show();await tick();
 assert.deepEqual(p.all(p.render()).filter(n=>n.props?.['data-kind']).map(n=>n.props['data-kind']),['hanzi','words','poems']);
 assert.match(p.text(p.render()),/先添加一些内容/);assert.doesNotMatch(p.text(p.render()),/今日累计|未打卡|统计暂不可用|暂无未学/);
 for(const kind of ['words','poems','hanzi'] as const){assert.equal(card(p,kind).props['data-state'],'empty');const controls=p.all(card(p,kind)).filter(n=>n.type==='Button');controls[0].props.onClick();assert.equal(p.routes.at(-1),`/pages/import/index?kind=${kind}`);controls[1].props.onClick();assert.equal(p.routes.at(-1),`/pages/discover/index?kind=${kind}`);}
 assert(!p.all(p.render()).some(n=>n.type==='CheckinStatus'));p.dispose();
});
for(const kind of ['words','poems','hanzi'] as const)test(`${kind}: returning from import restores learning and hides review until first learning`,async()=>{
 const f=fixture(),p=pageHarness('pages/home/index',f.read);await p.show();await tick();assert.equal(card(p,kind).props['data-state'],'empty');p.hide();f.totals[kind]=12;f.books[kind][0][fields[kind]]=12;await p.show();await tick();const area=card(p,kind);assert.equal(area.props['data-state'],undefined);assert.doesNotMatch(p.text(area),/录入|发现|复习/);assert.match(p.text(area),/学习新/);p.dispose();
});
for(const kind of ['words','poems','hanzi'] as const)test(`${kind}: an empty current book offers a working switch and late selections cannot change children`,async()=>{
 const f=fixture();f.books[kind].push({id:'other',name:'有内容的词本',[fields[kind]]:4});const p=pageHarness('pages/home/index',async path=>path.includes(kind==='words'?'wordbook_id=other':'book_id=other')?kind==='words'?{overall_total:4,overall_learned_count:0}:kind==='poems'?{overall_total:4,overall_learned_count:0}:{completed:0,goal:10,new_count:4,overall_total:4,overall_learned_count:0}:f.read(path));await p.show();await tick();assert.equal(card(p,kind).props['data-state'],'empty-book');assert.doesNotMatch(p.text(card(p,kind)),/发现/);const picker=p.all(card(p,kind)).find(n=>n.type==='Picker');picker.props.onChange({detail:{value:1}});await tick();await tick();assert.equal(p.cache.get(`${({words:'current_wordbook',poems:'current_poem_book',hanzi:'current_hanzi_book'}[kind])}:child-a`),'other');assert(p.requests.some(path=>path.includes('other')));p.cache.set('child_id','child-b');picker.props.onChange({detail:{value:1}});assert.equal(p.cache.get(`${({words:'current_wordbook',poems:'current_poem_book',hanzi:'current_hanzi_book'}[kind])}:child-b`),undefined);p.dispose();
});
test('missing books are valid empty states; request failure is retryable and never claims there is no content',async()=>{
 const f=fixture();f.books.hanzi=[];f.books.poems=[];let fail=true;const p=pageHarness('pages/home/index',async path=>{if(path.includes('/words?')&&fail)throw Error('网络失败');return f.read(path);});await p.show();await tick();for(const kind of ['poems','hanzi'])assert.equal(card(p,kind).props['data-state'],'empty');assert.equal(card(p,'words').props['data-state'],'error');assert.doesNotMatch(p.text(card(p,'words')),/录入|发现/);fail=false;p.all(card(p,'words')).find(n=>n.type==='Button').props.onClick();await tick();await tick();assert.equal(card(p,'words').props['data-state'],'empty');p.dispose();
});
test('delayed totals display a skeleton and stale child responses cannot produce an empty state',async()=>{
 const f=fixture(),gate=deferred(),p=pageHarness('pages/home/index',async path=>path.includes('/words?')?gate.promise:f.read(path));await p.show();assert.equal(card(p,'words').props['data-state'],'loading');assert.doesNotMatch(p.text(card(p,'words')),/录入|发现|0 \/ 10/);p.hide();p.cache.set('child_id','other');gate.resolve({book_total:0,learned_count:0});await tick();assert.equal(card(p,'words').props['data-state'],'loading');p.dispose();
});
test('mastered items and an empty new queue still show real learning history',async()=>{
 const f=fixture(),p=pageHarness('pages/home/index',async path=>path.includes('/words?')?{book_total:0,learned_count:0,overall_total:12,overall_learned_count:12}:path.includes('/hanzi?')?{total:0,learned_count:0,overall_total:12,overall_learned_count:12}:path.includes('/poems?')?{total:0,memorized_count:0,overall_total:12,overall_learned_count:12}:f.read(path));await p.show();await tick();for(const kind of ['words','poems','hanzi']){assert.equal(card(p,kind).props['data-state'],undefined);assert.match(p.text(card(p,kind)),/12/);assert.doesNotMatch(p.text(card(p,kind)),/录入|发现/);}p.dispose();
});
for(const missingBooks of [false,true])test(`sentence empty state, including ${missingBooks?'missing books':'an existing empty book'}, recovers after content arrives`,async()=>{
 const f=fixture();if(missingBooks)f.books.sentences=[];const flags:any[]=[],p=pageHarness('components/SentenceHomeCard',f.read,'SentenceHomeCard',{props:{onEmptyChange:(value:any)=>flags.push(value)}});await p.show();assert.equal(card(p,'sentences').props['data-state'],'empty');p.button('录入句子').onClick();assert.equal(p.routes.at(-1),'/pages/import/index?kind=sentences');assert.equal(flags.at(-1),true);p.hide();f.books.sentences=[{id:'book-a',name:'日常句子',sentence_count:8}];f.totals.sentences=8;await p.show();assert(p.button('学习新句'));assert.doesNotMatch(p.text(p.render()),/复习句子|录入句子/);assert.equal(flags.at(-1),false);p.dispose();
});
test('sentence malformed totals produce a retry error; other populated sentence books are switchable',async()=>{
 const f=fixture();let invalid=true;f.books.sentences.push({id:'other',name:'有内容的句子本',sentence_count:5});const p=pageHarness('components/SentenceHomeCard',async path=>invalid&&path.includes('/sentences?')?{total:undefined,learned:0}:path.includes('/sentences?book_id=other')?{total:5,learned:1}:f.read(path),'SentenceHomeCard');await p.show();assert.equal(card(p,'sentences').props['data-state'],'error');invalid=false;p.button('重新加载').onClick();await tick();assert.equal(card(p,'sentences').props['data-state'],'empty-book');p.all(p.render()).find(n=>n.type==='Picker').props.onChange({detail:{value:1}});await tick();await tick();assert.match(p.text(p.render()),/有内容的句子本/);assert(p.button('复习句子'));p.dispose();
});
for(const kind of kinds)test(`discover entry for ${kind} fetches the matching kinds and can return to all`,async()=>{
 const p=pageHarness('pages/discover/index',async()=>({items:[],next_offset:null}),undefined,{query:{kind}});await p.show();const shared=p.calls.filter(c=>c.path.includes('/shared-'));assert.equal(shared.length,1);assert(shared[0].path.includes(({words:'shared-wordbooks',poems:'shared-poem-books',hanzi:'shared-hanzi-books',sentences:'shared-sentence-books'}[kind])));p.button('查看全部类型').onClick();await tick();assert.equal(p.calls.filter(c=>c.path.includes('/shared-')).length,5);p.dispose();
});
