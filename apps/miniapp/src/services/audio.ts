import {useCallback,useEffect,useRef,useState} from 'react';
import Taro,{useDidHide} from '@tarojs/taro';
import {api,eventId,message,storage} from './api';
export type AudioTarget={word_id:string;content_version:number}|{sentence_id:string;content_version:number};
export function useAudio(){
 const [active,setActive]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState('');
 const [voices,setVoices]=useState<any[]>([]);
 const [gender,setGenderState]=useState<string>(()=>storage.get('audio_gender')||'Female');
 const intent=useRef(0),player=useRef<Taro.InnerAudioContext|null>(null),file=useRef('');
 const remove=(path:string)=>{if(path)Taro.getFileSystemManager().unlink({filePath:path,fail:()=>{}});};
 const release=useCallback(()=>{const current=player.current;player.current=null;if(current){current.stop();current.destroy();}remove(file.current);file.current='';},[]);
 const stop=useCallback(()=>{intent.current++;release();setActive('');setStatus('');},[release]);
 useEffect(()=>{let alive=true;api('/voices').then(data=>{if(alive)setVoices(data.items);}).catch(()=>{});return()=>{alive=false;};},[]);
 useDidHide(stop);useEffect(()=>()=>{intent.current++;release();},[release]);
 const setGender=(value:string)=>{stop();setGenderState(value);storage.set('audio_gender',value);};
 const play=async(target:AudioTarget,accent:'en-GB'|'en-US')=>{
  const key=JSON.stringify([target,accent]);if(active===key){stop();return;}
  stop();const ticket=intent.current;const current=()=>ticket===intent.current;
  setActive(key);setStatus('正在准备音频…');setError('');
  try{
   const catalog=await api('/voices');if(!current())return;setVoices(catalog.items);
   const voice=catalog.items.find((v:any)=>v.accent===accent&&v.gender===gender);
   if(!voice)throw Error(catalog.items.length?'VOICE_ACCENT_UNAVAILABLE':'AUDIO_NOT_CONFIGURED');
   let job=await api('/audio','POST',{...target,accent,voice_id:voice.id,speech_rate:1},eventId());
   if(!current())return;
   // A new tap is the explicit retry; polling never starts another synthesis.
   if(job.status==='failed'&&job.retryable)job=await api(`/jobs/${job.job_id}/retry`,'POST',{},eventId());
   const deadline=Date.now()+120000;
   while(current()&&['queued','running'].includes(job.status)){
    if(Date.now()>deadline)throw Error('AUDIO_WAIT_TIMEOUT');
    setStatus('音频生成中，首次播放需要稍等…');
    await new Promise(resolve=>setTimeout(resolve,2000));if(!current())return;
    job=await api(`/jobs/${job.job_id}`);
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
   context.onPlay(()=>{if(current())setStatus('正在播放 · 再次点击可停止');});
   context.src=downloaded.tempFilePath;context.play();
  }catch(e){if(current()){stop();setError(message(e));}}
 };
 return {play,stop,active,status,error,gender,setGender,voices};
}
