import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred} from './page-harness.ts';
import {libraryFilterOptions,librarySelectedStatuses,libraryFilterValue,libraryStatusLabels,type LibraryFilter} from '../src/services/library-status.ts';

test('bottom filter applies each checkbox immediately and closes without rolling changes back',()=>{
 const applied:LibraryFilter[]=[],closed:string[]=[];
 const props:{value:LibraryFilter;onChange:(value:LibraryFilter)=>void;onClose:()=>void}={value:'all',onChange(value){applied.push(value);props.value=value;},onClose:()=>closed.push('close')};
 const page=pageHarness('components/LibraryFilter',async()=>({}),'LibraryFilter',{props});
 const selected=()=>page.all(page.render()).filter(n=>n.type==='Button'&&n.props['aria-pressed']).map(n=>n.props['aria-label']);
 assert.deepEqual(selected(),['未学过','学习中']);
 assert(!page.all(page.render()).some(n=>n.type==='Button'&&['取消','确定'].includes(page.text(n))));
 page.button('已掌握').onClick();assert.deepEqual(selected(),['未学过','学习中','已掌握']);assert.equal(applied.at(-1),'unlearned,learned,archived');assert.equal(closed.length,0);
 page.button('未学过').onClick();page.button('学习中').onClick();assert.equal(applied.at(-1),'archived');assert.deepEqual(selected(),['已掌握']);
 const count=applied.length;page.button('已掌握').onClick();assert.equal(applied.length,count);assert.deepEqual(selected(),['已掌握']);
 let stopped=false;page.all(page.render()).find(n=>n.props?.className==='library-filter-panel').props.onClick({stopPropagation(){stopped=true;}});assert(stopped);assert.equal(closed.length,0);
 page.all(page.render()).find(n=>n.props?.className==='library-filter-mask').props.onClick();assert.equal(closed.length,1);assert.equal(applied.at(-1),'archived');
 page.button('恢复默认').onClick();assert.deepEqual(selected(),['未学过','学习中']);assert.equal(applied.at(-1),'all');page.button('关闭筛选').onClick();assert.equal(closed.length,2);page.dispose();
});

for(const kind of ['words','hanzi','poems'])test(`${kind} applies all seven combinations, preserves them on return and rejects stale panels`,async()=>{
 const read=async(path:string)=>path.endsWith('/wordbooks')||path.endsWith('/hanzi-books')?{items:[{id:'book-a',name:'当前本'}]}:path.endsWith('/ai-batches')?{items:[]}:{items:[],total:0,book_total:0,learned_count:0,matched_total:0,next_cursor:null,next_offset:null};
 const page=pageHarness(`pages/${kind}/index`,read);await page.show();
 const open=()=>{page.all(page.render()).find(n=>n.type==='Button'&&(kind==='poems'?n.props['aria-label']==='筛选古诗':n.props['aria-label']===`筛选${kind==='words'?'单词':'汉字'}`)).props.onClick();return page.all(page.render()).find(n=>n.type==='LibraryFilter');};
 for(let bits=1;bits<8;bits++){
  const statuses=libraryFilterOptions.filter((_,i)=>bits&(1<<i)),value=libraryFilterValue(statuses);
  open().props.onChange(value);await tick();assert(page.all(page.render()).some(n=>n.type==='LibraryFilter'),'sheet stays open while applying');
  const last=page.requests.filter(p=>p.includes(kind==='poems'?'/poems':kind==='words'?'/words?':'/hanzi?')).at(-1)!;
  if(value==='all')assert(!last.includes('archived'));else assert(last.includes('status='+value));
  page.hide();await page.show();const panel=open();assert.equal(panel.props.value,value);panel.props.onClose();
  assert.deepEqual(librarySelectedStatuses(value),statuses);
 }
 const panel=open(),count=page.requests.length;page.cache.set('child_id','child-b');panel.props.onChange('archived');await tick();assert.equal(page.requests.length,count);page.dispose();
});

test('a combined whole-list export uses the same filter as the displayed list',async()=>{
 const page=pageHarness('pages/words/index',async(path,method)=>path.endsWith('/wordbooks')?{items:[{id:'book-a',name:'词本'}]}:path.endsWith('/ai-batches')?{items:[]}:method==='POST'?{content:'csv'}:{items:[{id:'w',lemma:'cat',version:1}],total:1,book_total:1,learned_count:0,next_cursor:null});await page.show();
 page.all(page.render()).find(n=>n.props?.['aria-label']==='筛选单词').props.onClick();page.all(page.render()).find(n=>n.type==='LibraryFilter').props.onChange('unlearned,archived');await tick();
 page.all(page.render()).find(n=>n.type==='LibraryFilter').props.onClose();const {selectLibraryMenu}=await import('./page-harness.ts');await selectLibraryMenu(page,'单词管理','选择导出');page.button('全选当前状态').onClick();page.button('导出 PDF').onClick();await tick();assert.equal(page.calls.find(c=>c.path.endsWith('/word-exports'))?.body.status,'unlearned,archived');page.dispose();
});


test('successive live filter changes keep the sheet open and discard older responses',async()=>{
 const first=deferred();const page=pageHarness('pages/words/index',async path=>path.endsWith('/wordbooks')?{items:[{id:'book-a',name:'词本'}]}:path.endsWith('/ai-batches')?{items:[]}:path.includes('status=unlearned&')?first.promise:{items:path.includes('status=archived&')?[{id:'mastered',lemma:'current result',version:1}]:[],total:1,book_total:1,learned_count:0,next_cursor:null});await page.show();
 page.all(page.render()).find(n=>n.props?.['aria-label']==='筛选单词').props.onClick();page.all(page.render()).find(n=>n.type==='LibraryFilter').props.onChange('unlearned');await tick();page.all(page.render()).find(n=>n.type==='LibraryFilter').props.onChange('archived');await tick();
 first.resolve({items:[{id:'old',lemma:'stale result',version:1}],total:1,book_total:1,learned_count:0,next_cursor:null});await tick();assert.match(page.text(page.render()),/current result/);assert.doesNotMatch(page.text(page.render()),/stale result/);assert(page.all(page.render()).some(n=>n.type==='LibraryFilter'));page.all(page.render()).find(n=>n.type==='LibraryFilter').props.onClose();assert(!page.all(page.render()).some(n=>n.type==='LibraryFilter'));assert.match(page.text(page.render()),/current result/);page.dispose();
});
