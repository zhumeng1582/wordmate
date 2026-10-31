import {View,Button,Text} from '@tarojs/components';
import type {AudioTarget,useAudio} from '../services/audio';
type Player=ReturnType<typeof useAudio>;
export function AudioFeedback({audio}:{audio:Player}){
 return audio.error?<View className='error audio-error-feedback' role='alert'><View className='audio-error-message'>{audio.error}</View><Button className='audio-retry' onClick={()=>void audio.retry()}>重试播放</Button></View>:audio.active&&audio.status?<View className='audio-status' role='status'>{audio.status}</View>:null;
}
export function AudioIcon({active=false,playing=false}:{active?:boolean;playing?:boolean}){
 return <View className={'audio-icon'+(active?(playing?' audio-icon-playing':' audio-icon-loading'):'')}><View className='audio-icon-box'/><View className='audio-icon-cone'/><View className='audio-wave audio-wave-near'/><View className='audio-wave audio-wave-far'/>{active&&!playing&&<View className='audio-icon-ring'/>}</View>;
}
export function AudioText({audio,target,text,phonetic=false,suffix,onPlay}:{audio:Player;target:AudioTarget;text:string;phonetic?:boolean;suffix?:string;onPlay?:()=>void}){
 const active=audio.active===JSON.stringify(target);
 return <View className='audio-text-wrap'>
  <Button className={'audio-text'+(phonetic?' audio-phonetic':'')+(active?' audio-active':'')} aria-label={phonetic?'播放单词发音':'播放例句'} onClick={(e:any)=>{e?.stopPropagation?.();onPlay?.();void audio.play(target);}}>
   <AudioIcon active={active} playing={audio.status==='正在播放…'}/><Text className='audio-text-label'>{text}</Text>{suffix&&<Text className='audio-text-suffix'>{suffix}</Text>}
  </Button>
 </View>;
}
