import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick} from './page-harness.ts';
test('management combines types, preserves book order and opens header actions',async()=>{
 const p=pageHarness('components/BookManagement',async path=>({items:path.endsWith('/wordbooks')?[{id:'other',name:'其他词本',word_count:2},{id:'book-a',name:'当前词本',word_count:1}]:[{id:'h',name:'汉字本',hanzi_count:3}]}),'BookManagement');await p.show();const cards=p.all(p.render()).filter(n=>n.props.className==='book-manage-card card');assert.match(p.text(cards[0]),/其他词本/);assert.equal(cards.length,5);assert(!p.all(p.render()).some(n=>n.type==='Picker'));const action=(label:string)=>p.all(p.render()).find(n=>n.type==='Button'&&n.props['aria-label']===label);assert(!p.all(p.render()).some(n=>n.type==='Input'));action('搜索').props.onClick();assert.equal(p.routes.at(-1),'/pages/search/index');action('发现词本').props.onClick();assert.equal(p.routes.at(-1),'/pages/discover/index');await action('创建词本').props.onClick();await tick();assert.equal(p.routes.at(-1),'/pages/wordbook-edit/index');p.dispose();
});
for(const page of ['wordbook-edit','hanzi-book-edit'])test(`${page} creates with a name and keeps metadata optional`,async()=>{
 const p=pageHarness(`pages/${page}/index`,async()=>({id:'new'}),undefined,{query:{bookId:''}});await p.show();assert.equal(p.all(p.render()).filter(n=>n.type==='Input').length,1);p.button('补充资料（选填）').onClick();assert.equal(p.all(p.render()).filter(n=>n.type==='Input').length,4);p.all(p.render()).find(n=>n.type==='Input'&&n.props.placeholder.includes('备注标签')).props.onInput({detail:{value:'课外阅读'}});p.button('收起补充资料').onClick();p.all(p.render()).find(n=>n.type==='Input').props.onInput({detail:{value:'我的词本'}});p.button('保存').onClick();await tick();assert.equal(p.calls.find(c=>c.method==='POST')?.body.category,'课外阅读');p.dispose();
});

test('viewing words or characters and returning keeps order while updating current markers and counts',async()=>{
 let count=1;
 const p=pageHarness('components/BookManagement',async path=>({items:path.endsWith('/wordbooks')?[{id:'book-a',name:'第一本',word_count:count},{id:'second',name:'第二本',word_count:2}]:[{id:'h1',name:'第一字本',hanzi_count:1},{id:'h2',name:'第二字本',hanzi_count:2}]}),'BookManagement');
 const cards=()=>p.all(p.render()).filter(n=>n.props.className==='book-manage-card card');
 const order=()=>cards().map(n=>p.all(n).find(x=>x.props.className==='book-manage-name').props.children[0]);
 await p.show();const original=order();
 for(const [name,label,cache,id] of [['第二本','查看词本','current_wordbook:child-a','second'],['第二字本','查看字本','current_hanzi_book:child-a','h2']]){
  const card=cards().find(n=>p.text(n).includes(name));p.all(card).find(n=>n.type==='Button'&&p.text(n)===label).props.onClick();await p.hide();count++;await p.show();assert.deepEqual(order(),original);assert.equal(p.cache.get(cache),id);assert.match(p.text(cards().find(n=>p.text(n).includes(name))),/当前/);
 }
 assert.match(p.text(cards()[0]),/3 个单词/);p.dispose();
});
