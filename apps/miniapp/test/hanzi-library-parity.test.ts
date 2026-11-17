import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred,selectLibraryMenu} from './page-harness.ts';
const books=[{id:'first',name:'我的汉字本',grade:'一年级',version:1},{id:'second',name:'课外字本',grade:'二年级',version:1},{id:'shared',name:'共享字本',read_only:true,version:1}];
const rows=(character='春')=>({items:[{id:character,character,pinyin:'chūn'}],total:1,learned_count:0,next_cursor:null});
const pickers=(page:any)=>page.all(page.render()).filter((n:any)=>n.type==='Picker');
const input=(page:any,placeholder:string,value:string)=>page.all(page.render()).find((n:any)=>n.type==='Input'&&n.props.placeholder===placeholder).props.onInput({detail:{value}});

test('character library switches in place and rejects late rows from another book',async()=>{
 const late=deferred();let delayed=false;const page=pageHarness('pages/hanzi/index',async path=>path.endsWith('/hanzi-books')?{items:books}:path.includes('book_id=second')?rows('夏'):delayed?late.promise:rows(),undefined,{cache:{'current_hanzi_book:child-a':'first'}});
 await page.show();assert.match(page.text(page.render()),/我的汉字本/);assert(page.requests.filter(p=>p.includes('/hanzi?')).every(p=>p.includes('book_id=first')));
 delayed=true;page.hide();await page.show();page.button('切换字本').onClick();page.button('课外字本').onClick();await tick();late.resolve(rows('秋'));await tick();assert.equal(page.cache.get('current_hanzi_book:child-a'),'second');assert.match(page.text(page.render()),/课外字本/);assert.match(page.text(page.render()),/夏/);assert.doesNotMatch(page.text(page.render()),/秋/);
 await selectLibraryMenu(page,'添加与搜索','录入汉字');page.button('切换字本').onClick();page.button('新建字本').onClick();await selectLibraryMenu(page,'添加与搜索','搜索汉字');assert.deepEqual(page.routes.slice(-3),['/pages/import/index?kind=hanzi','/pages/hanzi-book-edit/index','/pages/search/index']);page.dispose();
});
test('a missing cached character book selects an existing book before any row read',async()=>{
 const page=pageHarness('pages/hanzi/index',async path=>{if(path.endsWith('/hanzi-books'))return {items:books};assert(path.includes('book_id=first'));return rows();},undefined,{cache:{'current_hanzi_book:child-a':'removed'}});
 await page.show();assert.equal(page.cache.get('current_hanzi_book:child-a'),'first');assert.doesNotMatch(page.text(page.render()),/全部字本/);page.dispose();
});
test('creating a character book uses a separate form and selects the saved book',async()=>{
 const page=pageHarness('pages/hanzi-book-edit/index',async(path,method,body)=>{assert.equal(path,'/children/child-a/hanzi-books');assert.equal(method,'POST');assert.equal(body.name,'我的新字本');assert.equal(body.grade,'一年级');return {id:'created'};},undefined,{query:{bookId:''}});
 await page.show();input(page,'输入字本名称','我的新字本');page.button('补充资料（选填）').onClick();input(page,'年级，例如：三年级','一年级');page.button('保存').onClick();await tick();assert.equal(page.cache.get('current_hanzi_book:child-a'),'created');assert.equal(page.cache.get('current_hanzi_book_name:child-a'),'我的新字本');assert.equal(page.backCount,1);page.dispose();
});
test('adding characters selects a writable destination and retries the original book after a lost response',async()=>{
 let fail=true;const requests:any[]=[];const read=async(path:string,method:string,body:any)=>{if(method==='GET')return {items:books};requests.push(body);if(fail)throw Error('NETWORK_TIMEOUT');return {added:2,linked:0,skipped:0};};
 const page=pageHarness('pages/hanzi-import/index',read,undefined,{cache:{'current_hanzi_book:child-a':'second'}});await page.show();assert.deepEqual(Array.from(pickers(page)[0].props.range),['我的汉字本','课外字本']);page.all(page.render()).find(n=>n.type==='Textarea').props.onInput({detail:{value:'春春夏'}});page.button('核对后保存').onClick();await tick();const first=page.calls.find(c=>c.method==='POST')!;assert.deepEqual(Array.from(first.body.characters),['春','夏']);assert.equal(first.body.book_id,'second');
 const cache=Object.fromEntries(page.cache);page.dispose();cache['current_hanzi_book:child-a']='first';fail=false;const again=pageHarness('pages/hanzi-import/index',read,undefined,{cache});await again.show();assert.match(again.text(again.render()),/课外字本/);assert.equal(pickers(again)[0].props.disabled,true);again.button('重试上次提交').onClick();await tick();const retry=again.calls.find(c=>c.method==='POST')!;assert.equal(retry.key,first.key);assert.deepEqual(JSON.parse(JSON.stringify(retry.body)),JSON.parse(JSON.stringify(first.body)));again.dispose();
});
test('character search entry opens shared search without changing the selected book',async()=>{
 const p=pageHarness('components/SearchRedirect',async()=>({}),'SearchRedirect',{cache:{'current_hanzi_book:child-a':'selected'}});await tick();assert.equal(p.routes.at(-1),'/pages/search/index');assert.equal(p.cache.get('current_hanzi_book:child-a'),'selected');p.dispose();
});

test('shared character discovery is included in the common discovery page',async()=>{const page=pageHarness('pages/discover/index',async path=>({items:path.startsWith('/shared-hanzi-books')?[{id:'source',title:'一年级',author:'老师',is_source:true,hanzi_count:2}]:[],next_offset:null}));await page.show();assert.equal(pickers(page).length,0);assert.equal(page.button('当前孩子的词本').disabled,true);page.button('家庭共享').onClick();assert.match(page.text(page.render()),/一年级/);page.dispose();});
test('background image review remembers the original destination after switching books',async()=>{
 const page=pageHarness('pages/hanzi-import/index',async(_path,method)=>method==='GET'?{items:books}:{},undefined,{cache:{'current_hanzi_book:child-a':'second'},extract:async()=>({name:'lesson.png',data:'base64'})});await page.show();page.button('拍照 / 图片').onClick();page.button('拍照识别').onClick();await tick();await tick();const uploaded=page.calls.find(c=>c.method==='POST')!;assert.equal(page.routes.at(-1),'/pages/import-records/index');const cache=Object.fromEntries(page.cache);cache['current_hanzi_book:child-a']='first';for(const key of Object.keys(cache))if(key.startsWith('hanzi_job_book:'))delete cache[key];page.dispose();
 const review=pageHarness('pages/hanzi-import/index',async path=>path.endsWith('/hanzi-books')?{items:books}:{raw_text:'春',status:'ready',book_id:'second'},undefined,{cache,query:{job:uploaded.body.id}});await review.show();assert.match(review.text(review.render()),/课外字本/);assert.equal(pickers(review)[0].props.value,1);assert.equal(review.cache.get('current_hanzi_book:child-a'),'second');review.dispose();
});
test('starting the current character book closes a different unfinished round before creating its own',async()=>{
 let abandoned=false;const old={id:'old',source:'new',book_id:'first',status:'in_progress',version:2,total_count:3,answered_count:1,active_session:null,current:null},fresh={id:'new',source:'new',book_id:'second',status:'in_progress',version:1,total_count:1,answered_count:0,current:{ordinal:1,hanzi_id:'h',character:'夏'}};
 const page=pageHarness('pages/hanzi-study/index',async(path,method,body)=>{
  if(path.endsWith('/hanzi-study-rounds')){if(method==='GET')return {round:old};assert.equal(abandoned,true);assert.equal(body.book_id,'second');return {round:fresh,session:{id:'lease-new',lease_generation:1}};}
  if(path.endsWith('/old'))return old;if(path.endsWith('/resume'))return {round:old,session:{id:'lease-old',lease_generation:2}};
  if(path.endsWith('/abandon')){assert.equal(body.lease_id,'lease-old');abandoned=true;return {...old,status:'abandoned'};}return {items:[{id:'h',character:'夏',learned_at:null}]};
 },undefined,{cache:{'current_hanzi_book:child-a':'second'}});await page.show();assert.equal(page.button('结束上次，开始当前字本').className,'btn primary');page.button('结束上次，开始当前字本').onClick();await tick();await tick();assert.equal(abandoned,true);assert.match(page.text(page.render()),/夏/);assert.equal(old.answered_count,1);page.dispose();
});
test('home resolves the selected character book before loading its counts',async()=>{
 const page=pageHarness('pages/home/index',async path=>{
  if(path==='/me')return {families:[{id:'family-a'}]};if(path.endsWith('/hanzi-books'))return {items:books};
  if(path.includes('/hanzi-progress')||path.includes('/hanzi?')){assert(path.includes('book_id=first'));return path.includes('/hanzi-progress')?{completed:1,goal:10,checked_in:false}:rows();}
  if(path.includes('/today'))return {child:{nickname:'豆芽'},completed_words:0,goal:10,new_count:0,due_count:0};return {items:[],learned_count:0,book_total:0};
 });await page.show();await tick();assert.equal(page.cache.get('current_hanzi_book:child-a'),'first');assert.match(page.text(page.render()),/我的汉字本/);assert(page.requests.some(p=>p.includes('/hanzi-progress?book_id=first')));page.dispose();
});
