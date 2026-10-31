import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {AudioFileCache} from '../src/services/audio-cache.ts';
const require=createRequire(import.meta.url),ts=require('typescript'),tick=()=>new Promise(resolve=>setImmediate(resolve));
test('audio files use a bounded LRU cache and each evicted file is removed',()=>{
 const removed:string[]=[],cache=new AudioFileCache(2,path=>removed.push(path));cache.set('first','/first');cache.set('second','/second');assert.equal(cache.get('first'),'/first');cache.set('third','/third');assert.deepEqual(removed,['/second']);assert.equal(cache.get('second'),undefined);cache.clear();assert.deepEqual(removed,['/second','/first','/third']);cache.clear();assert.equal(removed.length,3);
});
function player(options:{autoStart?:boolean;outputWait?:Promise<void>;outputError?:boolean}={}){
 const timers=new Map<number,()=>void>();let timerId=0;
 const slots:any[]=[],effects:(()=>void|(()=>void))[]=[],removed:string[]=[],requests:{path:string;data:any}[]=[],contexts:any[]=[],audioOptions:any[]=[],cache=new Map<string,any>([['access_token','token'],['child_id','child']]);let cursor=0,mounted=false,show=()=>{},hide=()=>{},voice='voice-one',downloads=0,downloadWait:Promise<void>|null=null;
 const hooks={useState:(initial:any)=>{const index=cursor++;if(!(index in slots))slots[index]=initial;return [slots[index],(value:any)=>{slots[index]=value;}];},useRef:(initial:any)=>{const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index];},useCallback:(callback:any)=>callback,useEffect:(effect:any)=>{if(!mounted)effects.push(effect);}};
 const taro={setInnerAudioOption:async(value:any)=>{audioOptions.push(value);if(options.outputWait)await options.outputWait;if(options.outputError)throw Error('Native output unavailable');},useDidShow:(callback:any)=>{show=callback;},useDidHide:(callback:any)=>{hide=callback;},getFileSystemManager:()=>({unlink:({filePath}:{filePath:string})=>removed.push(filePath)}),downloadFile:async()=>{const id=++downloads;if(downloadWait)await downloadWait;return {statusCode:200,tempFilePath:`/temp-${id}`};},createInnerAudioContext:()=>{const callbacks:any={},context={src:'',stop(){},destroy(){},onEnded(callback:any){callbacks.ended=callback;},onError(callback:any){callbacks.error=callback;},onPlay(callback:any){callbacks.play=callback;},play(){if(options.autoStart!==false)callbacks.play?.();},callbacks};contexts.push(context);return context;}};
 const services={storage:{get:(key:string)=>cache.get(key)||''},eventId:()=> 'event',message:(error:any)=>error.message,api:async(path:string,_method?:string,data?:any)=>{requests.push({path,data});return path==='/me/audio-settings'?{accent:'en-GB',voice_id:voice,auto_play:false}:{status:'succeeded',resource_path:'/audio/resource'};}};
 const module={exports:{} as any},code=ts.transpileModule(readFileSync('apps/miniapp/src/services/audio.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,Error,Date,setTimeout:(fn:()=>void)=>{timers.set(++timerId,fn);return timerId;},clearTimeout:(id:number)=>timers.delete(id),API_BASE:'https://example.com/api',require:(name:string)=>name==='react'?hooks:name==='@tarojs/taro'?taro:name==='./audio-cache'?{AudioFileCache}:services});
 const render=()=>{cursor=0;const result=module.exports.useAudio();mounted=true;return result;};const audio=render(),cleanup=effects.map(effect=>effect());
 return {audio,render,requests,removed,contexts,audioOptions,cache,timeouts:()=>{for(const callback of [...timers.values()])callback();},downloads:()=>downloads,show:()=>show(),hide:()=>hide(),voice:(value:string)=>{voice=value;},waitDownload:(value:Promise<void>|null)=>{downloadWait=value;},cleanup:()=>cleanup.forEach(effect=>effect?.())};
}
const target={word_id:'word',content_version:1};
test('opening an audio player reads settings without generating or downloading audio',async()=>{
 const p=player();await tick();assert.equal(p.requests.length,1);assert.equal(p.requests[0].path,'/me/audio-settings');assert.equal(p.downloads(),0);p.cleanup();
});
test('replaying a word reuses its file and settings instead of another request and download',async()=>{
 const p=player();await p.audio.play(target);p.contexts[0].callbacks.ended();await p.audio.play(target);assert.equal(p.downloads(),1);assert.equal(p.requests.filter(request=>request.path==='/audio').length,1);assert.equal(p.requests.filter(request=>request.path==='/me/audio-settings').length,1);assert.equal(p.contexts.length,2);p.cleanup();assert(p.removed.includes('/temp-1'));
});
test('changed voice and account scope cannot reuse the previous private audio file',async()=>{
 const p=player();await p.audio.play(target);p.hide();p.voice('voice-two');p.show();await tick();await p.audio.play(target);assert.equal(p.downloads(),2);p.audio.stop();p.cache.set('access_token','another-account');await p.audio.play(target);assert.equal(p.downloads(),3);assert(p.removed.includes('/temp-1'));assert(p.removed.includes('/temp-2'));p.cleanup();
});
test('rapid repeat taps share one download, and leaving during download never starts playback',async()=>{
 const p=player();let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);p.waitDownload(gate);const first=p.audio.play(target);await tick();await p.audio.play(target);assert.equal(p.downloads(),1);p.hide();release();await first;assert.equal(p.contexts.length,0);assert(p.removed.includes('/temp-1'));p.cleanup();
});
test('a native player that never starts reports a visible failure and retries the same word',async()=>{
 const p=player({autoStart:false});await p.audio.play(target);assert.equal(p.audioOptions[0].obeyMuteSwitch,false);assert.equal(p.audioOptions[0].mixWithOther,false);assert.equal(p.contexts[0].volume,1);assert.equal(p.render().status,'正在开始播放…');p.timeouts();assert.match(p.render().error,/未能开始播放/);assert.equal(p.render().active,'');await p.render().retry();assert.equal(p.downloads(),2);assert.equal(p.requests.filter(request=>request.path==='/audio').length,2);for(const request of p.requests.filter(request=>request.path==='/audio')){assert.equal(request.data.word_id,target.word_id);assert.equal(request.data.content_version,1);}p.cleanup();
});
test('native playback errors remain visible until retry or a deliberate stop',async()=>{
 const p=player();await p.audio.play(target);p.contexts[0].callbacks.error({errCode:10004});assert.match(p.render().error,/音频播放失败（10004）/);await p.render().retry();assert.equal(p.render().error,'');assert.equal(p.render().status,'正在播放…');p.audio.stop();assert.equal(p.render().active,'');p.cleanup();
});
test('native output is configured before playback and leaving during setup cancels playback',async()=>{
 let ready!:()=>void;const gate=new Promise<void>(resolve=>ready=resolve),p=player({outputWait:gate});const pending=p.audio.play(target);await tick();assert.equal(p.audioOptions.length,1);assert.equal(p.contexts.length,0);p.hide();ready();await pending;assert.equal(p.contexts.length,0);p.cleanup();
});
test('a failed global output setup produces an actionable error instead of silent playback',async()=>{
 const p=player({outputError:true});await p.audio.play(target);assert.equal(p.contexts.length,0);assert.equal(p.render().active,'');assert.equal(p.render().error,'AUDIO_OUTPUT_UNAVAILABLE');p.cleanup();
});
