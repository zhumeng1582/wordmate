import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HanziSpeech} from '../src/services/hanzi-speech.ts';
import {pageHarness,tick,deferred} from './page-harness.ts';
import {roundFixture} from './hanzi-round-fixture.ts';
function speechFixture(options:{confirm?:boolean;audio?:Promise<any>;download?:Promise<any>}={}){
 const values=new Map<string,any>([['access_token','account-a'],['child_id','child-a'],['family_id','family-a']]),calls:any[]=[],files:string[]=[],players:any[]=[];let modals=0,downloads=0;
 const store={get:(key:string)=>values.get(key)||'',set:(key:string,value:any)=>values.set(key,value)};
 const taro={showModal:async()=>{modals++;return {confirm:options.confirm!==false};},downloadFile:async(args:any)=>{downloads++;assert.equal(args.header.Authorization,'Bearer account-a');return options.download??{statusCode:200,tempFilePath:'/tmp/audio-'+downloads};},setInnerAudioOption:async()=>{},getFileSystemManager:()=>({unlink:({filePath}:any)=>files.push(filePath)}),createInnerAudioContext:()=>{const player={src:'',plays:0,pauses:0,destroys:0,ended:()=>{},error:()=>{},play(){this.plays++;},pause(){this.pauses++;},stop(){},destroy(){this.destroys++;},onEnded(fn:()=>void){this.ended=fn;},onError(fn:()=>void){this.error=fn;}};players.push(player);return player;}};
 const request=async(path:string,method='GET')=>{calls.push({path,method});return path.includes('/ai-settings')?{audio_yuan_per_10000_characters:1}:options.audio??{resource_path:'/audio/'+calls.length};};
 const speech=new HanziSpeech(taro,request,store,error=>error.message,'https://test.invalid/api');return {speech,values,calls,files,players,get modals(){return modals;},get downloads(){return downloads;}};
}
const target={id:'h',part:'character' as const,content:'春'};
test('character audio is user initiated, pauses/resumes, reuses cached content and shares existing consent',async()=>{
 const f=speechFixture();assert.equal(f.calls.length,0);await f.speech.play(target);assert.equal(f.speech.state.status,'正在播放');assert.equal(f.modals,1);assert.equal(f.downloads,1);assert(f.calls.some(c=>c.path.endsWith('/hanzi/h/audio/character')));
 await f.speech.play(target);assert.equal(f.speech.state.status,'已暂停');await f.speech.play(target);assert.equal(f.players[0].plays,2);assert.equal(f.downloads,1);
 f.players[0].ended();await f.speech.play(target);assert.equal(f.downloads,1);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 await f.speech.play({...target,content:'夏'});await f.speech.play({...target,part:'example',content:'春天来了。'});assert.equal(f.modals,1);assert.equal(f.calls.filter(c=>c.method==='POST').length,3);f.speech.dispose();assert.equal(f.files.length,3);assert(f.players.every(p=>p.destroys===1));
});
test('cancelled consent never synthesizes, and late synthesis/downloads cannot play after hiding or changing child',async()=>{
 const cancelled=speechFixture({confirm:false});await cancelled.speech.play(target);assert.equal(cancelled.calls.filter(c=>c.method==='POST').length,0);cancelled.speech.dispose();
 const delayed=deferred(),f=speechFixture({audio:delayed.promise});const work=f.speech.play(target);await tick();f.speech.hide();delayed.resolve({resource_path:'/audio/late'});await work;assert.equal(f.downloads,0);assert.equal(f.players.length,0);f.speech.show();f.values.set('child_id','other');const before=f.calls.length;await f.speech.play(target);assert.equal(f.calls.length,before);f.speech.dispose();
 const download=deferred(),g=speechFixture({download:download.promise});const playing=g.speech.play(target);await tick();g.speech.hide();download.resolve({statusCode:200,tempFilePath:'/tmp/late'});await playing;assert.deepEqual(g.files,['/tmp/late']);assert.equal(g.players.length,0);g.speech.dispose();
});
test('failed audio downloads clean up files and allow a deliberate retry',async()=>{
 const f=speechFixture({download:Promise.resolve({statusCode:403,tempFilePath:'/tmp/forbidden'})});await f.speech.play(target);assert.equal(f.speech.state.error,'AUDIO_DOWNLOAD_FAILED');assert.equal(f.speech.state.busy,false);assert.deepEqual(f.files,['/tmp/forbidden']);assert.equal(f.players.length,0);f.speech.dispose();
 const retry=speechFixture();await retry.speech.play(target);retry.players[0].error();assert(retry.speech.state.error);await retry.speech.play(target);assert.equal(retry.downloads,2);assert.equal(retry.players.length,2);retry.speech.dispose();
});
test('the character list offers pronunciation without expanding the row or writing learning state',async()=>{
 const item={id:'h',character:'春',pinyin:'chūn',version:1};const page=pageHarness('pages/hanzi/index',async path=>path.endsWith('/hanzi-books')?{items:[{id:'b',name:'字本'}]}:path.includes('/ai-settings')?{audio_yuan_per_10000_characters:1}:path.includes('/audio/character')?{resource_path:'/audio/h'}:{items:[item],total:1,learned_count:0});await page.show();let stopped=false;page.button('听春的发音').onClick({stopPropagation(){stopped=true;}});await tick();await tick();assert(stopped);assert(page.calls.some(c=>c.path.endsWith('/hanzi/h/audio/character')));assert(!page.calls.some(c=>/learning-events|\/mark|\/answer/.test(c.path)));assert(!page.all(page.render()).some(n=>n.props?.className==='wordbook-detail'));page.hide();page.dispose();
});
for(const source of ['new','review'])test(`${source} character cards play pronunciation directly; test listening reveals a hint without submitting an answer`,async()=>{
 const item={id:'h',character:'春',pinyin:'chūn',words:'春天',learned_at:source==='review'?'2026-11-12':null};
 const read=roundFixture(async path=>path.includes('/ai-settings')?{audio_yuan_per_10000_characters:1}:path.includes('/audio/character')?{resource_path:'/audio/h'}:{items:[item]});
 const page=pageHarness('pages/hanzi-study/index',read,undefined,{query:{source}});await page.show();page.button(source==='new'?'开始学习':'开始复习').onClick();await tick();page.button('听汉字发音').onClick();await tick();await tick();assert(page.calls.some(c=>c.path.endsWith('/hanzi/h/audio/character')));assert(!page.calls.some(c=>c.path.endsWith('/answer')||c.path.endsWith('/mark')));if(source==='review'){assert.equal(page.cache.get('hanzi-flow:account-a:child-a').revealed,true);assert.match(page.text(page.render()),/已揭晓读音提示/);}page.hide();page.dispose();
});
