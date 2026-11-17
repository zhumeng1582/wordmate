import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred} from './page-harness.ts';
const response=(path:string)=>path.startsWith('/textbook-volumes')?{items:[{id:'t',title:'教材',word_count:2}]}:{items:[{id:'same',title:path.startsWith('/shared-hanzi')?'四季汉字':'英语词本',word_count:1,hanzi_count:1,is_source:path.startsWith('/shared-word')}],next_offset:null};
test('discovery combines words, characters and textbooks and searches all sources',async()=>{
 const p=pageHarness('pages/discover/index',async path=>response(path));await p.show();assert.match(p.text(p.render()),/英语词本/);assert.match(p.text(p.render()),/四季汉字/);assert.match(p.text(p.render()),/教材/);assert(!p.all(p.render()).some(n=>n.type==='Input'||n.type==='Picker'));p.all(p.render()).find(n=>n.type==='Button'&&n.props['aria-label']==='搜索').props.onClick();assert.equal(p.routes.at(-1),'/pages/search/index');assert.equal(p.button('当前孩子的词本').disabled,true);p.button('预览词本').onClick();assert.equal(p.routes.at(-1),'/pages/book-preview/index?kind=shared_hanzi_book&id=same');assert(!p.calls.some(c=>c.method==='POST'));p.dispose();
});
test('discovery ignores pending results after changing children',async()=>{
 const gate=deferred<any>();const p=pageHarness('pages/discover/index',async path=>path.includes('child-a')?gate.promise:{items:[{id:'new',title:'新孩子'}],next_offset:null});await p.show();p.cache.set('child_id','child-b');await p.show();gate.resolve({items:[{id:'old',title:'旧孩子'}]});await tick();assert.match(p.text(p.render()),/新孩子/);assert.doesNotMatch(p.text(p.render()),/旧孩子/);p.dispose();
});
test('discovery loads independent source cursors without repeating textbooks',async()=>{
 const p=pageHarness('pages/discover/index',async path=>path.startsWith('/textbook')?{items:[{id:'t',title:'教材'}]}:path.includes('offset=50')?{items:[{id:'b',title:'第二页'}],next_offset:null}:{items:[{id:'a',title:'第一页'}],next_offset:50});await p.show();p.button('加载更多').onClick();await tick();assert.equal(p.calls.filter(c=>c.path.startsWith('/textbook')).length,1);assert.match(p.text(p.render()),/第二页/);assert.equal(p.all(p.render()).filter(n=>n.props.className==='discover-card card').length,9);p.dispose();
});

test('discovery tabs browse sources and keep pagination tied to the selected source',async()=>{
 const p=pageHarness('pages/discover/index',async path=>response(path));await p.show();p.button('教材').onClick();assert.doesNotMatch(p.text(p.render()),/英语词本|四季汉字/);assert.match(p.text(p.render()),/教材词本/);p.button('家庭共享').onClick();assert.match(p.text(p.render()),/英语词本|四季汉字/);assert(!p.all(p.render()).some(n=>n.props.className==='discover-title'&&p.text(n)==='教材'));p.dispose();
});
test('matching grade textbooks sort first while other grades remain accessible',async()=>{
 const p=pageHarness('pages/discover/index',async path=>path.startsWith('/families/')?{items:[{id:'child-a',school_grade:'小学三年级'}]}:path.startsWith('/textbook')?{items:[{id:'one',title:'一年级教材',grade:'1年级'},{id:'three',title:'三年级教材',grade:'3年级'}]}:{items:[],next_offset:null});await p.show();const titles=p.all(p.render()).filter(n=>n.props.className==='discover-title').map(n=>p.text(n));assert.match(titles[0],/三年级教材.*适合当前年级/);assert.equal(titles[1],'一年级教材');p.dispose();
});
