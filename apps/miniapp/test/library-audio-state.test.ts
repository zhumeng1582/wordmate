import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,deferred,tick} from './page-harness.ts';
for(const kind of ['hanzi','poems'] as const)test(`${kind} loading changes only the current audio button`,async()=>{
 const waiting=deferred(),items=[{id:'a',character:'春',title:'春晓',version:1},{id:'b',character:'月',title:'静夜思',version:1}];
 const page=pageHarness(`pages/${kind}/index`,async path=>path.endsWith('/hanzi-books')?{items:[{id:'book-a',name:'汉字本'}]}:path.includes('/ai-settings')?{audio_yuan_per_10000_characters:1}:/\/audio(?:\/character)?$/.test(path)?waiting.promise:{items,total:2,book_total:2,learned_count:0,next_cursor:null,next_offset:null});await page.show();
 const label=kind==='hanzi'?'听春的发音':'听春晓朗读',other=kind==='hanzi'?'听月的发音':'听静夜思朗读';page.button(label).onClick({stopPropagation(){}});await tick();await tick();assert.equal(page.button(label).disabled,true);assert.equal(page.button(other).disabled,false);
 const icons=()=>page.all(page.render()).filter(n=>n.type==='AudioIcon');assert.equal(icons().filter(n=>n.props.active).length,1);assert.equal(icons()[1].props.playing,false);
 page.button(other).onClick({stopPropagation(){}});await tick();assert.equal(page.calls.filter(c=>/\/audio(?:\/character)?$/.test(c.path)).length,1);
 waiting.resolve({resource_path:'/audio/test',parts:1});await tick();await tick();assert.equal(icons().filter(n=>n.props.active&&n.props.playing).length,1);assert.equal(page.button(other).disabled,false);assert.equal(icons()[1].props.active,false);
 const pause=kind==='hanzi'?'暂停春的发音':'暂停春晓朗读';page.button(pause).onClick({stopPropagation(){}});assert.equal(icons().filter(n=>n.props.active).length,0);assert.equal(page.routes.length,0);page.dispose();
});
