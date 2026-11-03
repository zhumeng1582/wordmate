import {useCallback,useEffect,useRef,useState} from 'react';
import Taro,{useDidHide,useDidShow} from '@tarojs/taro';
import {api,eventId,message,storage} from './api';
import {AudioFileCache} from './audio-cache';
import {AudioPrefetch,type PrefetchWord} from './audio-prefetch';
export type AudioTarget={word_id:string;content_version:number}|{sentence_id:string;content_version:number}|{tutor_message_id:string}|{preview:true;accent:'en-GB'|'en-US';voice_id:string};
type Preferences={accent:'en-GB'|'en-US';voice_id:string|null;auto_play:boolean};

export function useAudio(){
 const [active,setActive]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState(''),[accent,setAccent]=useState<'en-GB'|'en-US'>('en-GB'),[autoPlay,setAutoPlay]=useState(false);
 const preferenceRead=useRef(0),intent=useRef(0),activeRef=useRef(''),player=useRef<Taro.InnerAudioContext|null>(null),preferences=useRef<Preferences|null>(null),preferencePromise=useRef<Promise<Preferences>|null>(null),scope=useRef(''),hidden=useRef(false),lastTarget=useRef<AudioTarget|null>(null),startTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const remove=(path:string)=>{if(path)Taro.getFileSystemManager().unlink({filePath:path,fail:()=>{}});};
 const cache=useRef<AudioFileCache|null>(null);if(!cache.current)cache.current=new AudioFileCache(12,remove);
 const pendingFiles=useRef(new Map<string,Promise<string>>()),fileEpoch=useRef(0);
 const invalidatePending=()=>{fileEpoch.current++;pendingFiles.current.clear();};
 const clearStartTimer=()=>{if(startTimer.current!==null){clearTimeout(startTimer.current);startTimer.current=null;}};
 const release=useCallback(()=>{clearStartTimer();const current=player.current;player.current=null;if(current){current.stop();current.destroy();}},[]);
 const stop=useCallback(()=>{intent.current++;activeRef.current='';release();setActive('');setStatus('');setError('');},[release]);
 const currentScope=()=>`${storage.get('access_token')}:${storage.get('child_id')}`;
 const resetScope=()=>{const next=currentScope();if(scope.current!==next){prefetcher.current?.stop();invalidatePending();stop();lastTarget.current=null;cache.current!.clear();preferences.current=null;preferencePromise.current=null;preferenceRead.current++;setAutoPlay(false);scope.current=next;}return next;};
 const readPreferences=(force=false):Promise<Preferences>=>{
  const expectedScope=resetScope();
  if(force){preferences.current=null;preferencePromise.current=null;}
  if(preferences.current)return Promise.resolve(preferences.current);
  if(preferencePromise.current)return preferencePromise.current;
  const ticket=++preferenceRead.current;
  const request=api<Preferences>('/me/audio-settings').then(value=>{if(ticket===preferenceRead.current&&expectedScope===currentScope()){preferences.current=value;setAccent(value.accent);setAutoPlay(!!value.auto_play&&!!value.voice_id);}return value;}).finally(()=>{if(preferencePromise.current===request)preferencePromise.current=null;});
  preferencePromise.current=request;return request;
 };
 const prefetcher=useRef<AudioPrefetch|null>(null);if(!prefetcher.current)prefetcher.current=new AudioPrefetch({api,eventId,preferences:()=>readPreferences(),scope:currentScope,child:()=>String(storage.get('child_id'))});
 useEffect(()=>{void readPreferences().catch(()=>{});return()=>{prefetcher.current?.stop();invalidatePending();preferenceRead.current++;intent.current++;release();cache.current!.clear();};},[release]);
 useDidShow(()=>{const force=hidden.current;hidden.current=false;void readPreferences(force).catch(()=>{});});
 useDidHide(()=>{hidden.current=true;prefetcher.current?.stop();invalidatePending();preferenceRead.current++;setAutoPlay(false);stop();});
 const play=async(target:AudioTarget)=>{
  const expectedScope=resetScope(),key=JSON.stringify(target);lastTarget.current=target;if(activeRef.current===key)return;
  stop();const ticket=intent.current,current=()=>ticket===intent.current&&expectedScope===currentScope();activeRef.current=key;setActive(key);setStatus('正在准备音频…');setError('');
  try{
   const preview='preview' in target,prefs=preview?null:await readPreferences();if(!current())return;
   if(!preview&&!prefs?.voice_id)throw Error('AUDIO_NOT_CONFIGURED');
   const cacheKey=JSON.stringify({scope:expectedScope,target,...(prefs?{accent:prefs.accent,voice_id:prefs.voice_id}:{})});
   let path=cache.current!.get(cacheKey);
   if(!path){
    let pending=pendingFiles.current.get(cacheKey);
    if(!pending){
    const epoch=fileEpoch.current,valid=()=>epoch===fileEpoch.current&&expectedScope===currentScope()&&!hidden.current;
    const load=async()=>{
    let job:any=preview?await api('/voice-previews','POST',{accent:target.accent,voice_id:target.voice_id}):'tutor_message_id' in target?{...await api(`/word-tutor-messages/${target.tutor_message_id}/audio`,'POST',{accent:prefs!.accent,voice_id:prefs!.voice_id},undefined,120000),status:'succeeded'}:await api('/audio','POST',{...target,accent:prefs!.accent,voice_id:prefs!.voice_id,speech_rate:1},eventId());
    if(!valid())return '';
    if(!preview&&job.status==='failed'&&job.retryable)job=await api(`/jobs/${job.job_id}/retry`,'POST',{},eventId());
    const deadline=Date.now()+120000;
    while(valid()&&['queued','running'].includes(job.status)){
     if(Date.now()>deadline)throw Error('AUDIO_WAIT_TIMEOUT');if(current())setStatus('首次准备发音，需要稍等…');await new Promise(resolve=>setTimeout(resolve,2000));if(!valid())return '';
     job=await api(`/${preview?'voice-previews':'jobs'}/${job.job_id}`);
    }
    if(!valid())return '';if(job.status!=='succeeded')throw Error(job.attempts>=3?'AUDIO_ATTEMPTS_EXHAUSTED':job.error_code||'AUDIO_SYNTHESIS_FAILED');
    if(current())setStatus('正在加载音频…');const downloaded=await Taro.downloadFile({url:API_BASE+job.resource_path,header:{Authorization:`Bearer ${storage.get('access_token')}`},timeout:30000});
    if(!valid()){remove(downloaded.tempFilePath);return '';}if(downloaded.statusCode!==200){remove(downloaded.tempFilePath);throw Error(downloaded.statusCode===401?'UNAUTHENTICATED':'AUDIO_DOWNLOAD_FAILED');}
    cache.current!.set(cacheKey,downloaded.tempFilePath);return downloaded.tempFilePath;
    };
    const request=load();pending=request.finally(()=>{if(pendingFiles.current.get(cacheKey)===pending)pendingFiles.current.delete(cacheKey);});pendingFiles.current.set(cacheKey,pending);
    }
    path=await pending;if(!path)return;
   }
   if(!current())return;
   // Since WeChat base library 2.3.0, mute behavior is configured globally.
   // The old InnerAudioContext.obeyMuteSwitch property no longer takes effect.
   try{await Taro.setInnerAudioOption({obeyMuteSwitch:false,mixWithOther:false});}catch{throw Error('AUDIO_OUTPUT_UNAVAILABLE');}
   if(!current())return;
   const context=Taro.createInnerAudioContext();player.current=context;context.volume=1;
   context.onEnded(()=>{if(current())stop();});context.onError(event=>{if(current()){cache.current!.remove(cacheKey);stop();const code=Number.isInteger(event?.errCode)?`（${event.errCode}）`:'';setError(`音频播放失败${code}，请再次点击重试。`);}});context.onPlay(()=>{if(current()){clearStartTimer();setStatus('正在播放…');}});
   context.src=path;setStatus('正在开始播放…');startTimer.current=setTimeout(()=>{if(current()){cache.current!.remove(cacheKey);stop();setError('未能开始播放，请检查网络和媒体音量后重试。');}},10000);context.play();
  }catch(error){if(current()){stop();setError(message(error));}}
 };
 const retry=()=>{if(scope.current!==currentScope()){resetScope();return Promise.resolve();}const target=lastTarget.current;if(!target)return Promise.resolve();stop();return play(target);};
 const prefetch=(words:PrefetchWord[])=>{if(hidden.current)return;resetScope();prefetcher.current!.setWords(words);};
 return {play,retry,stop,prefetch,active,status,error,accent,autoPlay};
}
