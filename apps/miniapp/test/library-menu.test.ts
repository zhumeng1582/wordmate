import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred,selectLibraryMenu} from './page-harness.ts';
import {libraryConfig,libraryPageRoute,libraryActionGroups,chooseLibraryAction,type LibraryKind} from '../src/services/library-navigation.ts';
function fixture(kind:LibraryKind){const c=libraryConfig[kind];return async(path:string)=>{
 if(path.endsWith('/'+c.api))return {items:[{id:'book-a',name:'当前本'}]};if(path.endsWith('/ai-batches'))return {items:[]};
 return {items:[{id:'item',lemma:'spring',character:'春',pinyin:'chūn',version:1}],total:1,book_total:1,learned_count:0,first_unlearned_id:'item',first_unlearned_cursor:null,next_cursor:null};
};}
for(const kind of ['words','hanzi'] as LibraryKind[]){
 const c=libraryConfig[kind],create=(options:any={})=>pageHarness(`pages/${c.list}/index`,fixture(kind),undefined,{cache:{[`${c.store}:child-a`]:'book-a'},...options});
 test(`${kind} header exposes only search and more icons`,async()=>{
  const page=create();await page.show();const heading=page.all(page.render()).find(n=>n.props?.className==='library-header');assert(heading);assert.deepEqual(page.all(heading).filter(n=>n.type==='Button'&&n.props.className==='library-header-button').map(n=>n.props['aria-label']),[`搜索${c.name}`,`更多${c.name}操作`]);
  const entries:any[]=[[`${c.name}管理`,`录入${c.name}`,c.add],['',`搜索${c.name}`,c.search]];
  for(const [category,title,pageName] of entries){await selectLibraryMenu(page,category,title);assert.equal(page.routes.at(-1),libraryPageRoute(pageName));}assert.deepEqual(Array.from(page.actionSheets[0]),[`录入${c.name}`,...(kind==='hanzi'?['收藏汉字']:[]),'选择导出',...(kind==='words'?['导出英文字帖']:[]),'定位未学']);page.dispose();
 });
 test(`${kind} list actions and filter remain accessible`,async()=>{const page=create();await page.show();await selectLibraryMenu(page,'列表工具','定位未学');assert(page.all(page.render()).some(n=>n.props?.id===`${kind==='words'?'word':'hanzi'}-item`));assert.equal(page.routes.length,0);await selectLibraryMenu(page,'列表工具','选择导出');assert(page.all(page.render()).some(n=>n.props?.className==='wordbook-export-bar'));page.button('取消').onClick();await selectLibraryMenu(page,'列表工具','筛选：全部','已归档');assert(page.requests.some(p=>p.includes('status=archived')));page.dispose();});
 for(const change of ['hide','child','book'])test(`${kind} late popup choices cannot act after changing ${change}`,async()=>{
  const waiting=deferred();let shown=0;const page=create({actionSheet:async()=>{shown++;return waiting.promise;}});await page.show();page.all(page.render()).find(n=>n.props?.['aria-label']===`更多${c.name}操作`).props.onClick();await tick();assert.equal(shown,1);if(change==='hide')page.hide();else if(change==='child')page.cache.set('child_id','child-b');else page.cache.set(`${c.store}:child-a`,'book-b');waiting.resolve({tapIndex:0});await tick();assert.equal(page.routes.length,0);page.dispose();
 });
 for(const stage of [1])test(`${kind} cancelling popup stage ${stage} makes no changes`,async()=>{
  let shown=0;const page=create({actionSheet:async()=>{if(++shown===stage)throw {errMsg:'showActionSheet:fail cancel'};return {tapIndex:0};}});await page.show();page.all(page.render()).find(n=>n.props?.['aria-label']===`更多${c.name}操作`).props.onClick();await tick();assert.equal(page.routes.length,0);assert.equal(page.calls.filter(c=>c.method!=='GET').length,0);assert.doesNotMatch(page.text(page.render()),/暂时无法打开/);page.dispose();
 });
}
test('invalid group and item choices never select another action',async()=>{
 const groups=libraryActionGroups('words',{archive:'未归档',canLocate:false,canExport:false});let calls=0;assert.equal(await chooseLibraryAction(groups,async()=>{calls++;return {tapIndex:99};},()=>true),undefined);assert.equal(calls,1);assert.equal(await chooseLibraryAction(groups,async()=>({tapIndex:0}),()=>false),undefined);
 assert.equal(await chooseLibraryAction(groups,async()=>({tapIndex:-1}),()=>true),undefined);
});
