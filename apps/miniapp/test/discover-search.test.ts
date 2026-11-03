import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred} from './page-harness.ts';

test('empty search displays all shared books and clearing a search restores them',async()=>{
 const all=[{id:'a',title:'英语词本',word_count:1},{id:'b',title:'动物词本',word_count:1}];
 const page=pageHarness('pages/discover/index',async path=>path.startsWith('/textbook-volumes')?{items:[]}:{items:path.includes('q=')?[all[0]]:all,next_offset:null});
 await page.show();assert.match(page.text(page.render()),/英语词本/);assert.match(page.text(page.render()),/动物词本/);
 const input=()=>page.all(page.render()).find(n=>n.type==='Input'&&n.props.placeholder==='搜索名称、简介、作者或单词').props;
 input().onInput({detail:{value:'英语'}});await tick();assert.match(page.text(page.render()),/英语词本/);assert.doesNotMatch(page.text(page.render()),/动物词本/);
 input().onInput({detail:{value:'  '}});await tick();assert.match(page.text(page.render()),/动物词本/);assert(!page.requests.at(-1)?.includes('q='));
});

test('late search results cannot replace results for a cleared query',async()=>{
 const pending=deferred(),page=pageHarness('pages/discover/index',async path=>path.startsWith('/textbook-volumes')?{items:[]}:path.includes('q=')?pending.promise:{items:[{id:'all',title:'全部词本',word_count:1}],next_offset:null});
 await page.show();const input=()=>page.all(page.render()).find(n=>n.type==='Input').props;
 input().onInput({detail:{value:'旧搜索'}});input().onInput({detail:{value:''}});await tick();
 pending.resolve({items:[{id:'old',title:'过期结果',word_count:1}],next_offset:null});await tick();
 assert.match(page.text(page.render()),/全部词本/);assert.doesNotMatch(page.text(page.render()),/过期结果/);
});

test('the source child cannot join its own shared book from list or details',async()=>{
 const page=pageHarness('pages/discover/index',async path=>path.startsWith('/textbook-volumes')?{items:[]}:path.includes('?')?{items:[{id:'own',title:'自己的词本',word_count:1,is_source:true},{id:'other',title:'别人的词本',word_count:2,is_source:false}],next_offset:null}:{id:'own',title:'自己的词本',word_count:1,items:[]});
 await page.show();assert(page.requests[0].includes('child_id=child-a'));assert.equal(page.button('当前孩子的词本').disabled,true);assert.equal(page.button('加入词本').disabled,false);
 const card=page.all(page.render()).find(n=>n.props?.className==='discover-card card'&&page.text(n).includes('自己的词本'));card.props.onClick();await tick();
 const disabled=page.all(page.render()).filter(n=>n.type==='Button'&&page.text(n)==='当前孩子的词本');assert.equal(disabled.length,2);assert(disabled.every(n=>n.props.disabled));
});
test('textbook volumes are discoverable by title or word and join as a whole book',async()=>{
 const volume={id:'new-sailing-1-a',kind:'textbook',title:'新起航英语 1年级上册',author:'教材词本',grade:'1年级',textbook:'新起航英语',category:'教材',word_count:2,joined_book_id:null,items:[{lemma:'hello',meaning_zh:'你好'},{lemma:'book',meaning_zh:'书'}]};
 const page=pageHarness('pages/discover/index',async(path,method)=>method==='POST'?{id:'volume-book'}:path.startsWith('/textbook-volumes')?{items:[volume]}:{items:[],next_offset:null});
 await page.show();assert.match(page.text(page.render()),/新起航英语 1年级上册/);
 const input=()=>page.all(page.render()).find(n=>n.type==='Input').props;
 input().onInput({detail:{value:'hello'}});await tick();assert.match(page.text(page.render()),/新起航英语/);
 page.button('加入词本').onClick({stopPropagation(){}});await tick();
 assert(page.calls.some(c=>c.method==='POST'&&c.path==='/children/child-a/textbook-volumes/new-sailing-1-a/join'));assert.equal(page.cache.get('current_wordbook:child-a'),'volume-book');
});
