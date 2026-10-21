import {View,Button,Text} from '@tarojs/components';
import type {AudioTarget,useAudio} from '../services/audio';
type Player=ReturnType<typeof useAudio>;
export function AudioFeedback({audio}:{audio:Player}){
 return audio.error?<View className='error'>{audio.error}</View>:null;
}
export function AudioIcon({active=false,playing=false}:{active?:boolean;playing?:boolean}){
 return <View className={'audio-icon'+(active?(playing?' audio-icon-playing':' audio-icon-loading'):'')}><View className='audio-icon-box'/><View className='audio-icon-cone'/><View className='audio-wave audio-wave-near'/><View className='audio-wave audio-wave-far'/>{active&&!playing&&<View className='audio-icon-ring'/>}</View>;
}
export function AudioText({audio,target,text,phonetic=false}:{audio:Player;target:AudioTarget;text:string;phonetic?:boolean}){
 const active=audio.active===JSON.stringify(target);
 return <View>
  <Button className={'audio-text'+(phonetic?' audio-phonetic':'')+(active?' audio-active':'')} onClick={()=>audio.play(target)}>
   <AudioIcon active={active} playing={audio.status==='正在播放…'}/><Text>{text}</Text>
  </Button>
 </View>;
}
