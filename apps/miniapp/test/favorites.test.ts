import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick} from './page-harness.ts';
test('favorite button reads the latest annotation and updates only the favorite flag',async()=>{
 let current={favorite:false,version:3};const h=pageHarness('components/FavoriteButton',async(path,method,body)=>{assert.equal(path,'/words/word-a/annotations');if(method==='GET')return current;assert.equal(method,'PATCH');assert.equal(body.expected_version,3);assert.equal(body.favorite,true);current={favorite:true,version:4};return current;},'FavoriteButton',{props:{wordId:'word-a',initial:{favorite:false,version:1}}});
 let stopped=false;await h.button('☆').onClick({stopPropagation(){stopped=true;}});await tick();assert(stopped);assert(h.text(h.render()).includes('★'));assert.deepEqual(h.calls.map(x=>x.method),['GET','PATCH']);
});
test('favorite list starts a separate review and opens the favorite quiz',async()=>{
 const h=pageHarness('pages/favorites/index',async path=>{assert.match(path,/mark=favorite/);return {items:[{id:'word-a',lemma:'apple',meaning_zh:'苹果',annotations:{favorite:true,version:1}}],next_cursor:null,total:1};});await h.show();h.button('复习收藏').onClick();assert.equal(h.cache.get('review_source').source,'favorites');assert.equal(h.routes[0],'/pages/review/index');h.button('测试收藏').onClick();assert.equal(h.routes[1],'/pages/quiz/index?scope=favorites');
});
