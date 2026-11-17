import {SelectableText} from './SelectableText';
import {View,Button,Text} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {Icon} from './Icon';
import type {AudioTarget,useAudio} from '../services/audio';
type Player=ReturnType<typeof useAudio>;
export function AudioFeedback({audio}:{audio:Player}){
 return audio.error?<View className='error audio-error-feedback' role='alert'><View className='audio-error-message'>{audio.error}</View><Button className='audio-retry' onClick={()=>void audio.retry()}>重试播放</Button></View>:null;
}
export function AudioIcon({active=false,playing=false,tone}:{active?:boolean;playing?:boolean;tone?:'normal'|'primary'}){
 return <View className={'audio-icon'+(active?(playing?' audio-icon-playing':' audio-icon-loading'):'')} aria-hidden><Icon name='volume' tone={tone??(active?'primary':'normal')}/>{active&&!playing&&<View className='audio-icon-ring'/>}</View>;
}
export function CopyExample({text,onCopy}:{text:string;onCopy?:()=>void}){
 return <Button className='example-copy' aria-label='复制例句' onClick={(e:any)=>{e?.stopPropagation?.();onCopy?.();void Taro.setClipboardData({data:text}).catch(()=>Taro.showToast({title:'复制失败，请重试',icon:'none'}));}}><Icon name='copy' size='sm' tone='primary'/><Text>复制</Text></Button>;
}
export function AudioText({audio,target,text,phonetic=false,suffix,onPlay,selectable=false}:{audio:Player;target:AudioTarget;text:string;phonetic?:boolean;suffix?:string;onPlay?:()=>void;selectable?:boolean}){
 const active=audio.active===JSON.stringify(target);
 if(selectable)return <View className='audio-text-wrap audio-selectable-wrap'><View className='audio-text audio-selectable-text'><Button className='audio-text-play' aria-label={phonetic?'播放单词发音':'播放例句'} onClick={(e:any)=>{e?.stopPropagation?.();onPlay?.();void audio.play(target);}}><AudioIcon active={active} playing={audio.status==='正在播放…'}/></Button><SelectableText className='audio-text-label' onLongPress={onPlay}>{text}</SelectableText>{suffix&&<SelectableText className='audio-text-suffix' onLongPress={onPlay}>{suffix}</SelectableText>}</View></View>;
 return <View className={'audio-text-wrap'+(!phonetic?' audio-example-wrap':'')}>
  <Button className={'audio-text'+(phonetic?' audio-phonetic':'')+(active?' audio-active':'')} aria-label={phonetic?'播放单词发音':'播放例句'} onClick={(e:any)=>{e?.stopPropagation?.();onPlay?.();void audio.play(target);}}>
   <AudioIcon active={active} playing={audio.status==='正在播放…'}/><Text className='audio-text-label'>{text}</Text>{suffix&&<Text className='audio-text-suffix'>{suffix}</Text>}
  </Button>
  {!phonetic&&!!text&&<CopyExample text={text} onCopy={onPlay}/>}
 </View>;
}
