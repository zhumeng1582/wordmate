import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick} from './page-harness.ts';
import {readHomeSectionOrder,saveHomeSectionOrder,type HomeSection} from '../src/services/home-sections.ts';
const defaults:HomeSection[]=['words','poems','hanzi','sentences'];
const permute=(items:HomeSection[]):HomeSection[][]=>items.length?items.flatMap((item,i)=>permute(items.filter((_,j)=>j!==i)).map(rest=>[item,...rest])):[[]];
const permutations=permute(defaults);
const labels={words:'英语单词',poems:'古诗词',hanzi:'汉字学习',sentences:'英语常用句'};
const control=(page:any,label:string)=>page.all(page.render()).find((n:any)=>n.type==='Button'&&n.props['aria-label']===label).props;
const settingsOrder=(page:any)=>page.all(page.render()).filter((n:any)=>n.props?.className==='home-section-label').map((n:any)=>page.text(n).replace(/^\d+\. /,''));
const homeOrder=(page:any)=>page.all(page.render()).filter((n:any)=>n.props?.['data-kind']).map((n:any)=>n.props['data-kind']);
async function read(path:string){
 if(path==='/me')return {families:[{id:'family-a'}]};
 if(path.endsWith('/poem-books'))return {items:[{id:'poem-a',name:'我的诗本'}]};
 if(path.endsWith('/hanzi-books'))return {items:[{id:'hanzi-a',name:'我的字本'}]};
 if(path.includes('/hanzi-progress'))return {date:'2026-11-10',completed:2,goal:10,checked_in:false,new_count:5,due_count:3};
 if(path.includes('/today'))return {child:{id:'child-a'},wordbook:{id:'book-a',name:'我的词本'},completed_words:3,goal:10,new_count:4,due_count:2};
 if(path.includes('/words?'))return {book_total:20,learned_count:8};
 if(path.endsWith('/hanzi-study-rounds'))return {round:null};
 if(path.includes('/hanzi?'))return {total:20,learned_count:8};
 if(path.includes('/poems?'))return {total:2,memorized_count:1};
 return {items:[]};
}
test('home order reads legacy settings, repairs invalid data and rejects invalid writes',()=>{
 const cache=new Map<string,any>(),storage={get:(key:string)=>cache.get(key),set:(key:string,value:any)=>cache.set(key,value)};
 cache.set('home_sections:a',{words:false,poems:true,hanzi:true,sentences:false});assert.deepEqual(readHomeSectionOrder(storage,'a'),defaults);
 for(const [stored,expected] of [[null,defaults],[{},defaults],[['hanzi','hanzi','bad','words'],['hanzi','words','poems','sentences']],[['poems'],['poems','words','hanzi','sentences']]] as any){cache.set('home_section_order:a',stored);assert.deepEqual(readHomeSectionOrder(storage,'a'),expected);}
 assert.equal(saveHomeSectionOrder(storage,'a',['words','words','hanzi']),false);assert.equal(saveHomeSectionOrder(storage,'a',['words']),false);assert.equal(saveHomeSectionOrder(storage,'',defaults),false);
 const order:HomeSection[]=['hanzi','poems','words','sentences'];assert.equal(saveHomeSectionOrder(storage,'a',order),true);order.reverse();assert.deepEqual(readHomeSectionOrder(storage,'a'),['hanzi','poems','words','sentences']);assert.deepEqual(readHomeSectionOrder(storage,'b'),defaults);assert.deepEqual(readHomeSectionOrder(storage,''),defaults);
});
test('all 24 arrangements are reachable through settings controls and persist after reopening',async()=>{
 for(const expected of permutations){const page=pageHarness('pages/settings-home/index',async()=>({}));await page.show();const current=[...defaults];for(let target=0;target<expected.length;target++){let index=current.indexOf(expected[target]);while(index>target){control(page,`上移${labels[expected[target]]}`).onClick();[current[index-1],current[index]]=[current[index],current[index-1]];index--;assert.deepEqual(settingsOrder(page),current.map(key=>labels[key]));}}
  assert.deepEqual(settingsOrder(page),expected.map(key=>labels[key]));assert.equal(control(page,`上移${labels[expected[0]]}`).disabled,true);assert.equal(control(page,`下移${labels[expected[3]]}`).disabled,true);page.hide();await page.show();assert.deepEqual(settingsOrder(page),expected.map(key=>labels[key]));page.dispose();
 }
});
test('moving down and toggling visibility preserve each other and keep at least one section visible',async()=>{
 const page=pageHarness('pages/settings-home/index',async()=>({}));await page.show();control(page,'下移英语单词').onClick();assert.deepEqual(settingsOrder(page),['古诗词','英语单词','汉字学习','英语常用句']);
 const toggle=(label:string)=>page.all(page.render()).find(n=>n.type==='Switch'&&n.props['aria-label']===`首页显示${label}`).props;
 toggle('英语单词').onChange({detail:{value:false}});toggle('古诗词').onChange({detail:{value:false}});toggle('英语常用句').onChange({detail:{value:false}});assert.equal(toggle('汉字学习').disabled,true);control(page,'上移汉字学习').onClick();assert.equal(toggle('英语单词').checked,false);assert.equal(toggle('古诗词').checked,false);assert.equal(toggle('汉字学习').checked,true);assert.deepEqual(settingsOrder(page),['古诗词','汉字学习','英语单词','英语常用句']);toggle('英语单词').onChange({detail:{value:true}});assert.deepEqual(settingsOrder(page),['古诗词','汉字学习','英语单词','英语常用句']);page.dispose();
});
test('order is isolated by account and stale controls cannot change another account',async()=>{
 const page=pageHarness('pages/settings-home/index',async()=>({}));await page.show();control(page,'上移汉字学习').onClick();const stale=control(page,'上移汉字学习').onClick;page.cache.set('access_token','account-b');stale();assert.equal(page.cache.has('home_section_order:account-b'),false);await page.show();assert.deepEqual(settingsOrder(page),defaults.map(key=>labels[key]));control(page,'下移英语单词').onClick();page.cache.set('access_token','account-a');await page.show();assert.deepEqual(settingsOrder(page),['英语单词','汉字学习','古诗词','英语常用句']);page.cache.set('access_token','');await page.show();assert.match(page.text(page.render()),/请先登录/);assert.equal(page.all(page.render()).filter(n=>n.type==='Button').length,0);page.dispose();
});
test('home renders each saved arrangement, refreshes on return and retains hidden positions',async()=>{
 const page=pageHarness('pages/home/index',read);await page.show();await tick();
 for(const expected of permutations){page.hide();page.cache.set('home_section_order:account-a',expected);await page.show();await tick();assert.deepEqual(homeOrder(page),expected);assert.equal(page.button('学习新词').disabled,false);assert.equal(page.button('学习新字').disabled,false);}
 page.cache.set('home_sections:account-a',{words:false,poems:true,hanzi:true,sentences:false});page.hide();await page.show();assert.deepEqual(homeOrder(page),['hanzi','poems']);page.cache.set('home_sections:account-a',{words:true,poems:true,hanzi:true,sentences:false});page.hide();await page.show();assert.deepEqual(homeOrder(page),['hanzi','poems','words']);page.dispose();
});
