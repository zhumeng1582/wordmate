import {View,Button,Picker} from '@tarojs/components';
import type {AudioTarget,useAudio} from '../services/audio';
type Player=ReturnType<typeof useAudio>;
export function AudioSettings({audio}:{audio:Player}){
 const genders=['Female','Male'].filter(g=>audio.voices.some(v=>v.gender===g));
 return <View className='audio-settings'>
  {genders.length>0&&<Picker mode='selector' range={genders.map(g=>g==='Male'?'男声':'女声')} value={Math.max(0,genders.indexOf(audio.gender))} onChange={e=>audio.setGender(genders[Number(e.detail.value)])}><View className='muted'>发音声音：{audio.gender==='Male'?'男声':'女声'} ▾（按已开通音色提供）</View></Picker>}
  {audio.status&&<View className='notice'>{audio.status}<Button className='btn' onClick={audio.stop}>停止等待 / 播放</Button></View>}
  {audio.error&&<View className='error'>{audio.error}</View>}
 </View>;
}
export function AudioButtons({audio,target,sentence=false}:{audio:Player;target:AudioTarget;sentence?:boolean}){
 return <View className='row audio-buttons'>{(['en-GB','en-US'] as const).map(accent=><Button className='btn' key={accent} onClick={()=>audio.play(target,accent)}>{audio.active===JSON.stringify([target,accent])?'■ 停止':`▶ ${sentence?'例句':''}${accent==='en-GB'?'英音':'美音'}`}</Button>)}</View>;
}
