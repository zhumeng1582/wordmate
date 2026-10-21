import {View,Button,Text} from '@tarojs/components';
import type {AudioTarget,useAudio} from '../services/audio';
type Player=ReturnType<typeof useAudio>;
export function AudioFeedback({audio}:{audio:Player}){
 return audio.error?<View className='error'>{audio.error}</View>:null;
}
export function AudioText({audio,target,text,phonetic=false}:{audio:Player;target:AudioTarget;text:string;phonetic?:boolean}){
 const active=audio.active===JSON.stringify(target);
 return <View>
  <Button className={'audio-text'+(phonetic?' audio-phonetic':'')+(active?' audio-active':'')} onClick={()=>audio.play(target)}>
   <Text className='audio-speaker'>🔊</Text><Text>{text}</Text>
  </Button>
  {active&&<View className='audio-status'>{audio.status}</View>}
 </View>;
}
