import {ContentActions} from '../../components/ContentActions';
import {confirmMastery} from '../../services/content-marks';
import {useRef,useState} from 'react';
import Taro,{useRouter,useDidShow,useDidHide} from '@tarojs/taro';
import {View,Text,Button} from '@tarojs/components';
import {api,eventId,message,storage} from '../../services/api';
import {isFileCancel} from '../../services/files';
import {useAudio} from '../../services/audio';
import {AudioText,AudioFeedback,AudioIcon} from '../../components/AudioControls';
import {FavoriteButton} from '../../components/FavoriteButton';
import {TutorFloat} from '../../components/TutorFloat';
import type {WordAnnotationsRequest} from '../../generated/word-annotations';
import './index.css';
type Marks={easy?:boolean;error_prone?:boolean;favorite:boolean;manual_needs_correction?:boolean;needs_correction?:boolean;version:number};
export default function WordDetail(){
 const id=String(useRouter().params.id||''),[word,setWord]=useState<any>(null),[marks,setMarks]=useState<Marks|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[marking,setMarking]=useState(false),seq=useRef(0),owner=useRef(''),menuSeq=useRef(0),lock=useRef(false),audio=useAudio();const scope=()=>`${storage.get('access_token')}:${storage.get('child_id')}`;
 const load=async()=>{if(lock.current)return;const ticket=++seq.current,key=scope();menuSeq.current++;setBusy(true);setError('');try{const [result,annotations]=await Promise.all([api(`/children/${storage.get('child_id')}/words/${encodeURIComponent(id)}`),api<Marks>(`/words/${encodeURIComponent(id)}/annotations`).catch(()=>null)]);if(ticket===seq.current&&key===scope()){setWord(result);setMarks(annotations);if(!annotations)setError('标记信息暂时无法加载，请重试。');}}catch(e){if(ticket===seq.current&&key===scope())setError(message(e));}finally{if(ticket===seq.current&&key===scope())setBusy(false);}};
 useDidShow(()=>{if(owner.current!==scope()){owner.current=scope();setWord(null);setMarks(null);}void load();});useDidHide(()=>{seq.current++;menuSeq.current++;lock.current=false;audio.stop();setBusy(false);setMarking(false);});
 const mark=async(more=false,selected=-1)=>{
  if(!word||busy||lock.current||owner.current!==scope())return;lock.current=true;setMarking(true);setError('');const key=scope(),ticket=++menuSeq.current,generation=seq.current,current=()=>key===scope()&&ticket===menuSeq.current&&generation===seq.current;
  try{
   const latest=await api<Marks>(`/words/${encodeURIComponent(word.id)}/annotations`);if(!current())return;setMarks(latest);
   const actions:{title:string;field?:'easy'|'error_prone'|'manual_needs_correction';value:boolean}[]=more?[{title:latest.manual_needs_correction?'取消纠错标记':'标记待纠错',field:'manual_needs_correction',value:!latest.manual_needs_correction}]:[
    {title:latest.easy?'取消简单词':'标记简单词',field:'easy',value:!latest.easy},
    {title:latest.error_prone?'取消易错词':'标记易错词',field:'error_prone',value:!latest.error_prone},
    {title:word.library_archived_at?'恢复学习':'标记已掌握',value:!word.library_archived_at}
   ];
   const choice={tapIndex:selected};if(!current())return;const action=actions[choice.tapIndex];if(!action)return;audio.stop();
   if(action.field){const fresh=await api<Marks>(`/words/${encodeURIComponent(word.id)}/annotations`);if(!current())return;const body:WordAnnotationsRequest={expected_version:fresh.version,[action.field]:action.value};const result=await api<Marks>(`/words/${encodeURIComponent(word.id)}/annotations`,'PATCH',body,eventId());if(current())setMarks(result);}
   else{if(!await confirmMastery(word.library_archived_at,current))return;const result=await api(`/children/${storage.get('child_id')}/words/${encodeURIComponent(word.id)}/archive`,'PUT',{archived:action.value,expected_version:word.version});if(current())setWord((old:any)=>({...old,...result}));}
  }catch(e){if(current()&&!isFileCancel(e))setError(message(e));}finally{if(ticket===menuSeq.current){lock.current=false;setMarking(false);}}
 };
 return <View className='page word-detail'>{word&&<><View className='card'><View className='word-detail-heading'><Text className='word-detail-lemma' selectable userSelect>{word.lemma}</Text><Button className='word-detail-play' aria-label='播放单词发音' onClick={()=>void audio.play({word_id:word.id,content_version:word.version})}><AudioIcon active={audio.active===JSON.stringify({word_id:word.id,content_version:word.version})} playing={audio.status==='正在播放…'}/></Button></View><ContentActions name='单词' favorite={!!marks?.favorite} status={word.library_archived_at?'已掌握':(word.learning_status==='learned'||word.library_status==='learned')?'学习中':'未学过'} badges={[...(marks?.easy?['简单词']:[]),...(marks?.error_prone?['易错词']:[]),...(marks?.needs_correction?['待纠错']:[])]} disabled={busy||marking} favoriteControl={<FavoriteButton compact={false} disabled={busy||marking} wordId={word.id} initial={marks??undefined} onChange={value=>setMarks(old=>({...old,...value}))}/>} contextKey={`${scope()}:${word.id}`} markItems={[marks?.easy?'取消简单词':'标记简单词',marks?.error_prone?'取消易错词':'标记易错词',word.library_archived_at?'恢复学习':'标记已掌握']} contentItems={[marks?.manual_needs_correction?'取消纠错标记':'标记待纠错']} onMark={index=>void mark(false,index)} onContent={index=>void mark(true,index)}/><View className='word-detail-audio'><Text selectable userSelect>{(audio.accent==='en-GB'?word.ipa_gb:word.ipa_us)||'音标待补充'}</Text></View>{(word.senses?.length?word.senses:[{part_of_speech:word.part_of_speech,meaning_zh:word.meaning_zh}]).map((sense:any,index:number)=><View key={index} className='word-detail-meaning'><Text className='muted' selectable userSelect>{sense.part_of_speech} </Text><Text selectable userSelect>{sense.meaning_zh}</Text></View>)}</View>{word.example&&<View className='card'><View className='subtitle'>例句</View><AudioText audio={audio} target={{sentence_id:word.example.id,content_version:word.example.content_version}} text={word.example.text_en} selectable/><Text className='muted word-detail-translation' selectable userSelect>{word.example.translation_zh}</Text></View>}<TutorFloat wordId={word.id} onOpen={audio.stop}/></>}{busy&&!word&&<View className='muted'>正在加载单词…</View>}{error&&<View className='error'>{error}<Button className='text-action' disabled={busy||marking} onClick={()=>void load()}>重试</Button></View>}<AudioFeedback audio={audio}/></View>;
}
