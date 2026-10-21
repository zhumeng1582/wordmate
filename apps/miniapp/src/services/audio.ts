import {useCallback,useEffect,useRef,useState} from 'react';
import Taro,{useDidHide,useDidShow} from '@tarojs/taro';
import {api,eventId,message,storage} from './api';
export type AudioTarget={word_id:string;content_version:number}|{sentence_id:string;content_version:number}|{preview:true;accent:'en-GB'|'en-US';voice_id:string};
export function useAudio(){
 const [active,setActive]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState('');
 const [accent,setAccent]=useState<'en-GB'|'en-US'>('en-GB');
 const preferenceRead=useRef(0),intent=useRef(0),player=useRef<Taro.InnerAudioContext|null>(null),file=useRef('');
 const remove=(path:string)=>{if(path)Taro.getFileSystemManager().unlink({filePath:path,fail:()=>{}});};
 const release=useCallback(()=>{const current=player.current;player.current=null;if(current){current.stop();current.destroy();}remove(file.current);file.current='';},[]);
 const stop=useCallback(()=>{intent.current++;release();setActive('');setStatus('');},[release]);
 useDidShow(()=>{const ticket=++preferenceRead.current;api('/me/audio-settings').then(p=>{if(ticket===preferenceRead.current)setAccent(p.accent);}).catch(()=>{});});
 useDidHide(()=>{preferenceRead.current++;stop();});useEffect(()=>()=>{preferenceRead.current++;intent.current++;release();},[release]);
 const play=async(target:AudioTarget)=>{
  const key=JSON.stringify(target);
  // Repeated taps during preparation do not queue another download or cancel playback.
  if(active===key)return;
  stop();const ticket=intent.current;const current=()=>ticket===intent.current;
  setActive(key);setStatus('正在准备音频…');setError('');
  try{
   const preview='preview' in target;
   let job:any;
   if(preview){
    job=await api('/voice-previews','POST',{accent:target.accent,voice_id:target.voice_id});
   }else{
    const preferences=await api('/me/audio-settings');if(!current())return;setAccent(preferences.accent);
    if(!preferences.voice_id)throw Error('AUDIO_NOT_CONFIGURED');
    job=await api('/audio','POST',{...target,accent:preferences.accent,voice_id:preferences.voice_id,speech_rate:1},eventId());
   }
   if(!current())return;
   if(!preview&&job.status==='failed'&&job.retryable)job=await api(`/jobs/${job.job_id}/retry`,'POST',{},eventId());
   const deadline=Date.now()+120000;
   while(current()&&['queued','running'].includes(job.status)){
    if(Date.now()>deadline)throw Error('AUDIO_WAIT_TIMEOUT');
    setStatus('音频生成中，首次播放需要稍等…');
    await new Promise(resolve=>setTimeout(resolve,2000));if(!current())return;
    job=await api(`/${preview?'voice-previews':'jobs'}/${job.job_id}`);
   }
   if(!current())return;
   if(job.status!=='succeeded')throw Error(job.attempts>=3?'AUDIO_ATTEMPTS_EXHAUSTED':job.error_code||'AUDIO_SYNTHESIS_FAILED');
   setStatus('正在加载音频…');
   const downloaded=await Taro.downloadFile({url:API_BASE+job.resource_path,header:{Authorization:`Bearer ${storage.get('access_token')}`},timeout:30000});
   if(!current()){remove(downloaded.tempFilePath);return;}
   if(downloaded.statusCode!==200){remove(downloaded.tempFilePath);throw Error(downloaded.statusCode===401?'UNAUTHENTICATED':'AUDIO_DOWNLOAD_FAILED');}
   file.current=downloaded.tempFilePath;
   const context=Taro.createInnerAudioContext();player.current=context;
   context.onEnded(()=>{if(current())stop();});
   context.onError(()=>{if(current()){stop();setError('音频播放失败，请再次点击重试。');}});
   context.onPlay(()=>{if(current())setStatus('正在播放…');});
   context.src=downloaded.tempFilePath;context.play();
  }catch(e){if(current()){stop();setError(message(e));}}
 };
 return {play,stop,active,status,error,accent};
}
