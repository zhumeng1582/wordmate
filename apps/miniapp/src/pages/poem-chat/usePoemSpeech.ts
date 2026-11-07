import {useEffect,useRef,useState} from 'react';
import Taro,{useDidHide} from '@tarojs/taro';
import {api,message,storage} from '../../services/api';

export function usePoemSpeech(base:string,account:string,child:string){
 const [active,setActive]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState('');
 const intent=useRef(0),player=useRef<Taro.InnerAudioContext|null>(null),files=useRef(new Map<string,string>()),shown=useRef(true);
 const valid=(ticket:number)=>shown.current&&ticket===intent.current&&account===String(storage.get('access_token'))&&child===String(storage.get('child_id'));
 const stop=()=>{intent.current++;player.current?.stop();player.current?.destroy();player.current=null;setActive('');setStatus('');};
 const clear=()=>{stop();for(const path of files.current.values())Taro.getFileSystemManager().unlink({filePath:path,fail:()=>{}});files.current.clear();};
 useEffect(()=>()=>{shown.current=false;clear();},[]);
 useDidHide(()=>{stop();});
 const play=async(session:string,id:string)=>{if(active===id){stop();return;}stop();const ticket=intent.current;setError('');setActive(id);setStatus('正在准备音频…');try{
  const key=`${session}:${id}`;let path=files.current.get(key);
  if(!path){const settings=await api(`/me/ai-settings?family_id=${encodeURIComponent(String(storage.get('family_id')))}`);if(!valid(ticket))return;const price=settings.audio_yuan_per_10000_characters;if(!price)throw Error('AUDIO_PRICE_NOT_CONFIGURED');const noticeKey=`poem_chat_audio_notice:${account}:${child}`;if(!storage.get(noticeKey)){const consent=await Taro.showModal({title:'朗读 AI 讲解',content:`首次生成朗读使用家庭额度，语音价格为 ¥${price}/万字符；已生成的音频可重复播放。`,confirmText:'继续'});if(!valid(ticket))return;if(!consent.confirm){stop();return;}storage.set(noticeKey,true);}
   const result=await api(`${base}/sessions/${session}/message-audio/${id}`,'POST',{},undefined,120000);if(!valid(ticket))return;setStatus('正在加载音频…');const file=await Taro.downloadFile({url:API_BASE+result.resource_path,header:{Authorization:`Bearer ${account}`},timeout:30000});if(!valid(ticket)||file.statusCode!==200){if(file.tempFilePath)Taro.getFileSystemManager().unlink({filePath:file.tempFilePath,fail:()=>{}});if(valid(ticket))throw Error('AUDIO_DOWNLOAD_FAILED');return;}path=file.tempFilePath;files.current.set(key,path);
  }
  await Taro.setInnerAudioOption({obeyMuteSwitch:false,mixWithOther:false});if(!valid(ticket))return;const p=Taro.createInnerAudioContext();player.current=p;p.src=path;p.onEnded(()=>{if(valid(ticket))stop();});p.onError(()=>{if(valid(ticket)){stop();setError('音频播放失败，请重试。');}});p.onPlay(()=>{if(valid(ticket))setStatus('正在播放…');});p.play();
 }catch(e){if(valid(ticket)){stop();setError(message(e));}}};
 return {play,stop,active,status,error};
}
