import {SelectableText} from '../../components/SelectableText';
import {AudioIcon,AudioFeedback} from '../../components/AudioControls';
import {useRef,useState,useEffect} from 'react';
import Taro,{useRouter,useDidShow,useDidHide} from '@tarojs/taro';
import {View,Text,Button} from '@tarojs/components';
import {api,eventId,message,storage} from '../../services/api';
import {useAudio} from '../../services/audio';
import {sentenceScope,type SentenceRating,type SentenceRound,type PendingSentenceAnswer} from '../../services/sentence-learning';
import './index.css';
export default function SentenceStudy(){
 const params=useRouter().params,[round,setRound]=useState<SentenceRound|null>(null),[today,setToday]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const scope=()=>sentenceScope(storage),owner=useRef(''),visible=useRef(true),seq=useRef(0),locked=useRef(false),roundRef=useRef(round),pending=useRef<PendingSentenceAnswer|null>(null),autoPlayed=useRef(''),audio=useAudio(),playRef=useRef(audio.play);playRef.current=audio.play;roundRef.current=round;
 const pendingKey=(key:string)=>`pending_sentence_answer:${key}`,current=(n:number,key:string)=>visible.current&&n===seq.current&&key===scope();
 // Older receipts may still contain a hidden next sentence. Reload its current
 // content, using the legacy reveal endpoint only when the old server needs it.
 const display=async(value:SentenceRound,n:number,key:string):Promise<SentenceRound|null>=>{
  if(value.status!=='active'||!value.current||value.current.text_en)return value;
  const base=`/children/${storage.get('child_id')}/sentence-study-rounds/${value.id}`;
  let fresh=await api<SentenceRound>(base);if(!current(n,key))return null;
  if(fresh.status==='active'&&fresh.current&&!fresh.current.text_en){fresh=await api<SentenceRound>(`${base}/reveal`,'POST',{lease_id:fresh.lease_id,ordinal:fresh.current.ordinal});if(!current(n,key))return null;}
  if(fresh.current&&!fresh.current.text_en)throw Error('句子内容暂时无法读取，请重新连接。');return fresh;
 };
 const load=async()=>{if(locked.current)return;const n=++seq.current,key=scope();setBusy(true);setError('');try{
  if(!storage.get('access_token')||!storage.get('child_id'))throw Error('请先登录并选择孩子。');if(owner.current!==key){owner.current=key;setRound(null);setToday(null);pending.current=storage.get(pendingKey(key))??null;}
  const base=`/children/${storage.get('child_id')}/sentence-study-rounds`;
  if(pending.current){const prior=await api<SentenceRound>(`${base}/${pending.current.round_id}`);if(!current(n,key))return;if(prior.status==='completed'||prior.current&&prior.current.ordinal>pending.current.ordinal){pending.current=null;storage.set(pendingKey(key),null);setRound(prior);if(prior.status==='completed')return;}}
  const body={source:params.source??'new',...(params.bookId?{book_id:params.bookId}:{}),...(params.date_from?{date_from:params.date_from,date_to:params.date_to??params.date_from}:{})};
  const value=await api<SentenceRound>(base,'POST',body,eventId());if(!current(n,key))return;const r=await display(value,n,key);if(!r||!current(n,key))return;setRound(r);if(pending.current&&pending.current.round_id===r.id){pending.current.lease_id=r.lease_id;storage.set(pendingKey(key),pending.current);}else if(pending.current){pending.current=null;storage.set(pendingKey(key),null);}
 }catch(e){if(current(n,key))setError(message(e));}finally{if(current(n,key))setBusy(false);}};
 useDidShow(()=>{visible.current=true;void load();});
 useDidHide(()=>{visible.current=false;seq.current++;locked.current=false;setBusy(false);audio.stop();const r=roundRef.current,key=owner.current;if(r?.status==='active'&&key===scope())void api(`/children/${storage.get('child_id')}/sentence-study-rounds/${r.id}/release`,'POST',{lease_id:r.lease_id}).catch(()=>{});});
 useEffect(()=>{const timer=setInterval(()=>{const r=roundRef.current,key=owner.current;if(!visible.current||locked.current||key!==scope()||r?.status!=='active')return;void api(`/children/${storage.get('child_id')}/sentence-study-rounds/${r.id}/heartbeat`,'POST',{lease_id:r.lease_id}).catch(e=>{if(visible.current&&key===scope())setError(message(e));});},45000);return()=>clearInterval(timer);},[]);
 const answer=async(rating:SentenceRating)=>{const r=roundRef.current;if(locked.current||busy||!r?.current?.text_en||owner.current!==scope())return;if(pending.current&&pending.current.rating!==rating)return;locked.current=true;setBusy(true);setError('');audio.stop();const key=scope(),n=seq.current;if(!pending.current)pending.current={round_id:r.id,lease_id:r.lease_id,ordinal:r.current.ordinal,event_id:eventId(),rating};storage.set(pendingKey(key),pending.current);
  try{const p=pending.current,result=await api<{round:SentenceRound;today:any}>(`/children/${storage.get('child_id')}/sentence-study-rounds/${p.round_id}/answer`,'POST',{lease_id:p.lease_id,ordinal:p.ordinal,event_id:p.event_id,rating:p.rating});if(!current(n,key))return;const shown=await display(result.round,n,key);if(!shown||!current(n,key))return;pending.current=null;storage.set(pendingKey(key),null);setRound(shown);setToday(result.today);}catch(e){if(current(n,key))setError(message(e));}finally{if(n===seq.current)locked.current=false;if(current(n,key))setBusy(false);}};
 const end=async()=>{const r=roundRef.current;if(!r||locked.current)return;const key=scope(),n=seq.current,confirm=await Taro.showModal({title:'结束本轮学习？',content:'已提交的学习进度会保留，未完成的句子可以下次再学。',confirmText:'结束本轮'});if(!confirm.confirm||!current(n,key))return;locked.current=true;setBusy(true);try{await api(`/children/${storage.get('child_id')}/sentence-study-rounds/${r.id}/end`,'POST',{lease_id:r.lease_id});if(current(n,key)){pending.current=null;storage.set(pendingKey(key),null);await Taro.navigateBack();}}catch(e){if(current(n,key))setError(message(e));}finally{if(n===seq.current)locked.current=false;if(current(n,key))setBusy(false);}};
 useEffect(()=>{const item=round?.current;if(!visible.current||busy||!audio.autoPlay||!item?.text_en||!item.content_version||owner.current!==scope())return;const key=`${scope()}:${round!.id}:${item.ordinal}:${item.content_version}`;if(autoPlayed.current===key)return;autoPlayed.current=key;void playRef.current({sentence_id:item.sentence_id,content_version:item.content_version});},[round?.id,round?.current?.ordinal,round?.current?.content_version,audio.autoPlay,busy]);
 const item=round?.current;
 const title=round?.source==='new'?'学习新句':round?.source==='wrong'?'句子巩固':'句子学习';
 return <View className='page sentence-study'><View className='sentence-study-heading'><View className='title'>{title}</View>{round?.status==='active'&&<Button className='text-action' disabled={busy} onClick={()=>void end()}>结束本轮</Button>}</View>
 {error&&<View className='error'>{error}<Button className='text-action' disabled={busy} onClick={()=>void load()}>重新连接</Button></View>}
 {!round&&busy&&<View className='card muted'>正在准备句子…</View>}
 {round?.status==='active'&&item&&<><View className='sentence-study-progress'><Text>本组进度</Text><Text>{round.total-round.remaining+1} / {round.total} 句</Text></View><View className='card sentence-learning-card'><View className='sentence-learning-heading'><Button className='sentence-learning-play' aria-label='播放句子发音' disabled={busy||!item.text_en||!item.content_version} onClick={()=>void audio.play({sentence_id:item.sentence_id,content_version:item.content_version!})}><AudioIcon tone='primary' active={audio.active===JSON.stringify({sentence_id:item.sentence_id,content_version:item.content_version})} playing={audio.status==='正在播放…'}/></Button><SelectableText block className='sentence-learning-english'>{item.text_en||'正在读取句子…'}</SelectableText></View><SelectableText block className='sentence-learning-translation'>{item.translation_zh}</SelectableText><AudioFeedback audio={audio}/></View>
 <View className='sentence-learning-footer'>{pending.current?<View className='sentence-save-status'><View className='muted small'>{busy?'正在保存学习进度…':'学习进度尚未确认，重试不会重复记录。'}</View><Button className='btn primary' disabled={busy} onClick={()=>void answer(pending.current!.rating)}>重试保存</Button></View>:<><Button className='btn secondary' disabled={busy||!item.text_en} onClick={()=>void answer('again')}>还需巩固</Button><Button className='btn primary' disabled={busy||!item.text_en} onClick={()=>void answer('good')}>{round.remaining===1?'完成本轮':'下一句'}</Button></>}</View><View className='muted small sentence-learning-note'>听音跟读，熟悉后继续。点击下方按钮保存本句进度。</View></>}
 {round?.status==='completed'&&<View className='card sentence-summary'><View className='subtitle'>本轮学习完成</View><View>已学习 {round.total} 句</View>{round.wrong>0&&<View className='muted'>{round.wrong} 句已标记为需要巩固。</View>}{today&&<View className='sentence-today'>今日 {today.completed}/{today.goal} 句{today.checked_in?' · 已打卡':''}</View>}<View className='muted small'>学习进度已保存，会按掌握情况安排复习。</View>{round.wrong>0&&<Button className='btn secondary' onClick={()=>void Taro.redirectTo({url:`/pages/sentence-study/index?source=wrong${round.book_id?`&bookId=${round.book_id}`:''}`})}>巩固易忘句</Button>}<Button className='btn primary' onClick={()=>void Taro.navigateBack()}>完成</Button></View>}
 {!busy&&!round&&!error&&<Button className='btn primary' onClick={()=>void load()}>开始学习</Button>}
 </View>;
}
