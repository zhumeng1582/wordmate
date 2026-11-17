import {SelectableText} from './SelectableText';
import {View,Text,Button} from '@tarojs/components';
import {Chevron} from './Chevron';
import {AudioIcon} from './AudioControls';
import './LibraryItemSummary.css';
type Props={title:string;status:string;description:string;note?:string;selecting:boolean;selected:boolean;audioLabel:string;audioActive:boolean;audioPlaying:boolean;audioDisabled?:boolean;onPronounce:()=>void;onOpen:()=>void};
export function LibraryItemSummary({title,status,description,note,selecting,selected,audioLabel,audioActive,audioPlaying,audioDisabled=false,onPronounce,onOpen}:Props){
 return <View className='library-item-summary'>
  {selecting&&<Text className={`word-select ${selected?'checked':''}`}>{selected?'✓':'○'}</Text>}
  <View className='library-item-copy'>
   <View className='library-item-top'>
    <SelectableText className='library-item-title' aria-label={`${title}，${status}`}>{title}</SelectableText>
    {!selecting&&<Button className='library-item-reading' aria-label={audioLabel} disabled={audioDisabled} onClick={event=>{event.stopPropagation();if(!audioDisabled)onPronounce();}}><AudioIcon tone='primary' active={audioActive} playing={audioPlaying}/></Button>}
   </View>
   <View className='library-item-meta'>
    <SelectableText className='library-item-meta-text'>{description}{note?` · ${note}`:''}</SelectableText>
    {!selecting&&<Button className='library-item-detail' aria-label={`查看${title}`} onClick={event=>{event.stopPropagation();onOpen();}}><Text>详情</Text><Chevron direction='right'/></Button>}
   </View>
  </View>
 </View>;
}
