import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred} from './page-harness.ts';
import {visibleSearchTabs,searchTypeAfterResults,searchResultRoute} from '../src/services/unified-search.ts';
const item=(id:string,kind='word')=>({id,key:`${kind}:${id}`,kind,title:id,subtitle:'释义',snippet:'搜索摘要',source:'mine',book_names:'我的词本',archived:false,item_count:1});
function data(q:string,counts:any,type='all',items:any[]=[item(q)]){return {query:q,type,counts:{words:0,poems:0,hanzi:0,books:0,...counts},groups:Object.entries(counts).filter(([key,n])=>Number(n)>0&&(type==='all'||type===key)).map(([key,n])=>({type:key,total:n,items:key==='words'?items:[item(q,key==='poems'?'poem':key==='hanzi'?'hanzi':'wordbook')]})),next_cursor:null};}
const tabs=(p:any)=>p.all(p.render()).filter((n:any)=>n.type==='Button'&&String(n.props.className).startsWith('unified-tab ')).map((n:any)=>p.text(n));
async function enter(p:any,q:string){p.all(p.render()).find((n:any)=>n.type==='Input').props.onInput({detail:{value:q}});await p.runTimeouts();await tick();}
test('only categories with matches have tabs; total emptiness hides all including All',()=>{
 assert.deepEqual(visibleSearchTabs({words:1,poems:0,hanzi:0,books:2}).map(x=>x.key),['all','words','books']);assert.deepEqual(visibleSearchTabs({words:0,poems:0,hanzi:0,books:0}),[]);assert.equal(searchTypeAfterResults('words',{words:0,poems:2}),'all');assert.equal(searchResultRoute(item('w')), '/pages/word-detail/index?id=w');
});
test('dynamic tabs, category fallback, empty results and stale response protection work in the shared page',async()=>{
 const gate=deferred<any>();const p=pageHarness('pages/search/index',async path=>{const u=new URL('https://test'+path),q=u.searchParams.get('q')!,type=u.searchParams.get('type')!;if(q==='slow')return gate.promise;return q==='first'?data(q,{words:2,books:1},type):q==='poem'?data(q,{poems:1},type):data(q,{},type);});
 await p.show();assert.deepEqual(tabs(p),[]);await enter(p,'first');assert.deepEqual(tabs(p),['全部','单词2','词本1']);assert(!p.text(p.render()).includes('古诗词 ·'));
 p.button('单词2').onClick();await tick();await enter(p,'slow');assert.deepEqual(tabs(p),['全部','单词2','词本1']);await enter(p,'poem');assert.deepEqual(tabs(p),['全部','古诗词1']);assert(p.calls.some(x=>x.path.includes('q=poem&type=all')));gate.resolve(data('slow',{words:1}));await tick();assert.deepEqual(tabs(p),['全部','古诗词1']);await enter(p,'missing');assert.deepEqual(tabs(p),[]);assert.match(p.text(p.render()),/没有找到相关内容/);p.dispose();
});
test('opening a detail and returning preserves query, tab, results and scroll without another search',async()=>{
 const p=pageHarness('pages/search/index',async()=>data('spring',{words:1}));await p.show();await enter(p,'spring');p.all(p.render()).find(n=>n.type==='ScrollView').props.onScroll({detail:{scrollTop:180}});const before=p.calls.length;p.button('spring').onClick();assert.equal(p.routes.at(-1),'/pages/word-detail/index?id=spring');p.hide();await p.show();assert.equal(p.calls.length,before);assert.deepEqual(tabs(p),['全部','单词1']);assert.equal(p.all(p.render()).find(n=>n.type==='ScrollView').props.scrollTop,180);assert.match(p.text(p.render()),/spring/);p.dispose();
});
test('changing child invalidates pending results and isolates search history',async()=>{
 const gate=deferred<any>(),p=pageHarness('pages/search/index',async()=>gate.promise,undefined,{cache:{'unified_search_history:account-a:child-a':['旧搜索']}});await p.show();assert.match(p.text(p.render()),/旧搜索/);await enter(p,'old');p.cache.set('child_id','child-new');await p.show();gate.resolve(data('old',{words:1}));await tick();assert.deepEqual(tabs(p),[]);assert.doesNotMatch(p.text(p.render()),/旧搜索|word:old/);p.dispose();
});
test('category pagination appends without duplicates and keeps unavailable categories hidden',async()=>{
 let page=0;const p=pageHarness('pages/search/index',async path=>{const type=new URL('https://t'+path).searchParams.get('type')!;if(type==='all')return data('alpha',{words:4},type,[item('alpha1')]);page++;return {...data('alpha',{words:4},type,page===1?[item('alpha1'),item('alpha2')]:[item('alpha2'),item('alpha3'),item('alpha4')]),next_cursor:page===1?'next':null};});await p.show();await enter(p,'alpha');p.button('查看全部').onClick();await tick();p.button('加载更多').onClick();await tick();const cards=p.all(p.render()).filter(n=>n.props?.className==='unified-result');assert.equal(cards.length,4);assert.deepEqual(tabs(p),['全部','单词4']);p.dispose();
});
test('old search URLs redirect to the unified page',async()=>{const p=pageHarness('components/SearchRedirect',async()=>({}),'SearchRedirect',{query:{q:'春'}});await tick();assert.equal(p.routes.at(-1),'/pages/search/index?q=%E6%98%A5');p.dispose();});

test('poem search titles are plain while wordbook titles retain their own punctuation',async()=>{
 const {searchDisplayTitle}=await import('../src/services/unified-search.ts');assert.equal(searchDisplayTitle({...item('p','poem'),title:'《春晓》'}),'春晓');assert.equal(searchDisplayTitle({...item('b','wordbook'),title:'《小学语文》生词本'}),'《小学语文》生词本');
});
