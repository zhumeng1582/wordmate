import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick} from './page-harness.ts';
const fixture=async(path:string)=>path.endsWith('/wordbooks')?{items:[{id:'book-a',name:'本一'},{id:'book-b',name:'本二',read_only:true}]}:path.endsWith('/ai-batches')?{items:[]}:{items:[],total:0,book_total:0,learned_count:0,next_cursor:null};
for(const [label,page] of [['新建词本','wordbook-edit'],['词本管理与发现','wordbooks']])test(`book switch popup opens ${label} and closes before navigation`,async()=>{
 const p=pageHarness('pages/words/index',fixture);await p.show();p.button('切换词本').onClick();const heading=p.all(p.render()).find(n=>n.props.className==='book-switch-heading');assert.deepEqual(p.all(heading).filter(n=>n.type==='Button').map(n=>n.props['aria-label']),['新建词本','词本管理与发现']);p.button(label).onClick();assert.equal(p.routes.at(-1),`/pages/${page}/index`);assert(!p.all(p.render()).some(n=>n.props.role==='dialog'));p.dispose();
});
test('book popup can be dismissed and stale child choices cannot navigate',async()=>{
 const p=pageHarness('pages/words/index',fixture);await p.show();p.button('切换词本').onClick();p.button('关闭').onClick();assert.equal(p.routes.length,0);p.button('切换词本').onClick();p.cache.set('child_id','child-b');p.button('新建词本').onClick();assert.equal(p.routes.length,0);assert.equal(p.cache.get('current_wordbook:child-a'),'book-a');p.dispose();
});

for(const kind of ['words','hanzi'])for(const count of [2,12])test(`${kind} switch adapts to ${count} books and scrolls only long lists`,async()=>{
 const p=pageHarness(`pages/${kind}/index`,async path=>path.endsWith('/wordbooks')||path.endsWith('/hanzi-books')?{items:Array.from({length:count},(_,i)=>({id:i?'book-'+i:'book-a',name:'本'+i}))}:fixture(path));await p.show();p.button(kind==='words'?'切换词本':'切换字本').onClick();const list=p.all(p.render()).find(n=>String(n.props.className).startsWith('book-switch-list '));assert.equal(list.type,count>5?'ScrollView':'View');assert.equal(p.all(list).filter(n=>n.type==='Button').length,count);if(kind==='hanzi'){p.button('新建字本').onClick();assert.equal(p.routes.at(-1),'/pages/hanzi-book-edit/index');}p.dispose();
});
