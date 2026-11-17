import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred} from './page-harness.ts';
const items=[{id:'p1',title:'春晓',author:'孟浩然',dynasty:'唐',version:1},{id:'p2',title:'静夜思',author:'李白',dynasty:'唐',version:1}];
const event={stopPropagation(){}};
test('list narration stays on the list, pauses and resumes, and switches poems',async()=>{
 const page=pageHarness('pages/poems/index',async path=>path.includes('/ai-settings')?{audio_yuan_per_10000_characters:1}:path.endsWith('/audio')?{resource_path:'/audio/test',parts:1}:{items,total:2,next_offset:null});
 await page.show();let stopped=false;page.button('听春晓朗读').onClick({stopPropagation(){stopped=true;}});await tick();await tick();assert(stopped);assert.equal(page.routes.length,0);assert(page.requests.includes('/children/child-a/poems/p1/audio'));assert.equal(page.downloads.length,1);
 page.button('暂停春晓朗读').onClick(event);assert(page.button('继续春晓朗读'));page.button('继续春晓朗读').onClick(event);assert(page.button('暂停春晓朗读'));assert.equal(page.downloads.length,1);
 page.button('听静夜思朗读').onClick(event);await tick();await tick();assert(page.button('暂停静夜思朗读'));assert(page.button('听春晓朗读'));assert(page.requests.includes('/children/child-a/poems/p2/audio'));assert.equal(page.modals.length,1);assert(!page.calls.some(c=>/memorization|learning-events/.test(c.path)));
 page.button('查看静夜思').onClick(event);assert.equal(page.routes.at(-1),'/pages/poem-detail/index?id=p2');assert(page.button('听静夜思朗读'));page.dispose();
});
for(const action of ['hide','filter','owner'] as const)test(`late narration is discarded after ${action}`,async()=>{
 const waiting=deferred(),page=pageHarness('pages/poems/index',async path=>path.includes('/ai-settings')?{audio_yuan_per_10000_characters:1}:path.endsWith('/audio')?waiting.promise:{items,total:2,next_offset:null});await page.show();page.button('听春晓朗读').onClick(event);await tick();
 if(action==='hide')page.hide();else if(action==='owner'){page.cache.set('child_id','child-b');await page.show();}else{page.button('筛选古诗').onClick();page.all(page.render()).find(n=>n.type==='LibraryFilter').props.onChange('unlearned');}
 waiting.resolve({resource_path:'/audio/late',parts:1});await tick();await tick();assert.equal(page.downloads.length,0);assert(!page.all(page.render()).some(n=>n.props?.['aria-label']==='暂停春晓朗读'));page.dispose();
});
test('failed list narration can be retried',async()=>{
 let attempts=0;const page=pageHarness('pages/poems/index',async path=>{if(path.includes('/ai-settings'))return {audio_yuan_per_10000_characters:1};if(path.endsWith('/audio')){if(++attempts===1)throw Error('朗读暂不可用');return {resource_path:'/audio/test'};}return {items,total:2,next_offset:null};});await page.show();page.button('听春晓朗读').onClick(event);await tick();await tick();assert.match(page.text(page.render()),/朗读暂不可用/);assert(!page.button('听春晓朗读').disabled);page.button('听春晓朗读').onClick(event);await tick();await tick();assert(page.button('暂停春晓朗读'));assert.equal(attempts,2);page.dispose();
});
