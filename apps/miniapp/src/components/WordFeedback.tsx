import {useRef,useState} from 'react';
import {Button} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {api,eventId,message,storage} from '../services/api';
import type {useAudio} from '../services/audio';

type Example={id:string;content_version:number};
export function WordFeedback({wordId,wordVersion,example,audio,onOpen}:{wordId:string;wordVersion:number;example?:Example;audio:ReturnType<typeof useAudio>;onOpen?:()=>void}){
 const [busy,setBusy]=useState(false),lock=useRef(false),pending=useRef<{signature:string;key:string}|null>(null);
 const options=[{label:'单词发音不对',kind:'pronunciation'},{label:'单词拼写不对',kind:'spelling'},{label:'中文翻译不对',kind:'translation'},...(example?[{label:'例句内容不对',kind:'example'},{label:'例句发音不对',kind:'example_pronunciation'}]:[])];
 const report=async()=>{if(lock.current)return;lock.current=true;setBusy(true);onOpen?.();const scope=`${storage.get('access_token')}:${storage.get('child_id')}`;
  try{const choice=await Taro.showActionSheet({itemList:options.map(option=>option.label)});const selected=options[choice.tapIndex];if(!selected)return;
   const sentence=selected.kind==='example'||selected.kind==='example_pronunciation',target=sentence&&example?{sentence_id:example.id,content_version:example.content_version}:{word_id:wordId,content_version:wordVersion};
   const audioId=['pronunciation','example_pronunciation'].includes(selected.kind)&&audio.lastAudio?.target===JSON.stringify(target)?audio.lastAudio.audioId:undefined;
   const body={kind:selected.kind,word_version:wordVersion,...(sentence&&example?{sentence_id:example.id,sentence_version:example.content_version}:{}),...(audioId?{audio_id:audioId}:{})};const signature=JSON.stringify([scope,wordId,body]),submission=pending.current?.signature===signature?pending.current:{signature,key:eventId()};pending.current=submission;
   if(scope!==`${storage.get('access_token')}:${storage.get('child_id')}`)return;await api(`/words/${wordId}/feedback`,'POST',body,submission.key);if(scope!==`${storage.get('access_token')}:${storage.get('child_id')}`)return;pending.current=null;await Taro.showToast({title:'反馈已提交',icon:'success'});
  }catch(error){if(!String((error as any)?.errMsg??'').includes('cancel')&&scope===`${storage.get('access_token')}:${storage.get('child_id')}`)await Taro.showModal({title:'提交失败',content:message(error),showCancel:false});}finally{lock.current=false;setBusy(false);}
 };
 return <Button className='word-feedback-button' aria-label='反馈单词问题' disabled={busy} onClick={e=>{e.stopPropagation();void report();}}>反馈</Button>;
}
