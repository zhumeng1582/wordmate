import {enterReview} from '../services/review-entry';
import {useAudio} from '../services/audio';
import {AudioText,AudioFeedback} from './AudioControls';
import {useEffect,useRef,useState} from 'react';
import {View,Button} from '@tarojs/components';
import Taro,{useDidShow,useDidHide} from '@tarojs/taro';
import {api,storage,eventId,message} from '../services/api';
export function ReviewSession({onExit}:{onExit?:()=>void}){
 const audio=useAudio();
  const scope=`${storage.get('access_token')}:${storage.get('child_id')}`,pendingKey=`review_pending:${scope}`,activeKey=`active_review_session:${scope}`;
  const [visible,setVisible]=useState(true),[rejected,setRejected]=useState(false);
  useDidShow(()=>setVisible(true));useDidHide(()=>setVisible(false));
  const [session,setSession]=useState<any>(null),[cards,setCards]=useState<any[]>([]),[meanings,setMeanings]=useState<Record<string,string>>({}),[revealed,setRevealed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(0),[hasPending,setHasPending]=useState(!!storage.get(pendingKey));
  const [translations,setTranslations]=useState<Record<string,string>>({});
  const inFlight=useRef(false);
  const [source]=useState<any>(()=>storage.get('review_source')||{source:'scheduled'}),[remaining,setRemaining]=useState(0);
  const run=async(fn:()=>Promise<any>)=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(message(e));if(e instanceof Error&&['SESSION_EXPIRED','CARD_CONFLICT'].includes(e.message)){setRejected(true);setSession(null);Taro.removeStorageSync(activeKey);}}finally{inFlight.current=false;setBusy(false);}};
  useEffect(()=>{if(!session||!visible)return;const beat=()=>{api(`/study-sessions/${session.id}/heartbeat`,'POST',{lease_generation:session.lease_generation}).catch(e=>{setError(message(e));if(e instanceof Error&&e.message==='SESSION_EXPIRED'){setSession(null);Taro.removeStorageSync(activeKey);}});};beat();const timer=setInterval(beat,30000);return()=>clearInterval(timer);},[session,visible]);
  const load=async(s:any)=>{const data=await api(`/study-sessions/${s.id}/cards`);setCards(data.items);setRemaining(data.remaining);};
  const send=async(body:any)=>{await api('/reviews','POST',body);Taro.removeStorageSync(pendingKey);setHasPending(false);setRejected(false);setDone(x=>x+1);if(session)await load(session);setRevealed(false);};
  const start=()=>run(async()=>{
    const s=await enterReview({read:()=>storage.get(activeKey),clear:()=>Taro.removeStorageSync(activeKey),
      heartbeat:s=>api(`/study-sessions/${s.id}/heartbeat`,'POST',{lease_generation:s.lease_generation}),
      create:()=>api(`/children/${storage.get('child_id')}/study-sessions`,'POST',source,eventId()),
      save:s=>storage.set(activeKey,s)});
    await load(s);setSession(s);
  });
  const entered=useRef(false);
  useEffect(()=>{if(!entered.current&&!hasPending){entered.current=true;void start();}},[hasPending]);
  const exit=()=>{audio.stop();if(onExit)onExit();else Taro.navigateBack();};
  const card=cards[0];
  const playRef=useRef(audio.play),autoPlayed=useRef('');playRef.current=audio.play;
  useEffect(()=>{audio.stop();},[card?.id,session?.id,audio.stop]);
  useEffect(()=>{
    if(!visible||!card||!session||hasPending)return;
    const key=`${session.id}:${card.id}`;if(autoPlayed.current===key)return;
    let cancelled=false;
    api('/me/audio-settings').then(p=>{if(cancelled)return;autoPlayed.current=key;if(p.auto_play)void playRef.current({word_id:card.child_word_id,content_version:card.word_version});}).catch(()=>{});
    return()=>{cancelled=true;};
  },[visible,card?.id,session?.id,hasPending]);
  return <View className='page'><View className='title'>{(session?.source??source.source)==='scheduled'?'今天的复习':'错词再练一遍'}</View><View className='muted'>先回忆，再查看词义，按真实记忆情况选择。</View>{error&&<View className='error'>{error}</View>}<AudioFeedback audio={audio}/>
    {hasPending&&!busy&&<View className='card'><View>有一条答案尚未确认保存，请重试。</View><Button className='btn' disabled={busy} onClick={()=>run(()=>send(storage.get(pendingKey)))}>重试保存</Button>{rejected&&<Button className='btn secondary' onClick={()=>{Taro.removeStorageSync(pendingKey);setHasPending(false);setRejected(false);setError('');}}>清除已被服务器拒绝的答案，重新开始</Button>}</View>}
    {!session&&!hasPending&&<>{busy?<View className='muted'>正在准备单词…</View>:error&&<Button className='btn primary' onClick={start}>重试</Button>}</>}
    {!session&&!busy&&<Button className='text-action' onClick={exit}>返回</Button>}
    {session&&<View className='card'>{session.excluded_new_words>0&&<View className='notice'>受每日新词额度限制，已跳过 {session.excluded_new_words} 个新词。</View>}<View className='muted'>本次已完成 {done} · 队列剩余 {remaining}</View>{card?<>{card.practice_only&&<View className='notice'>此词尚未到期：本次只练习，不改变复习计划。</View>}<View className='word'>{card.lemma}</View><View className='review-pronunciation'><AudioText audio={audio} phonetic target={{word_id:card.child_word_id,content_version:card.word_version}} text={(audio.accent==='en-GB'?card.ipa_gb:card.ipa_us)||'听发音'}/><View className='muted review-pos'>{card.part_of_speech}</View></View>{revealed&&<View className='review-meaning'>{meanings[card.child_word_id]}</View>}{card.example?<><AudioText audio={audio} target={{sentence_id:card.example.id,content_version:card.example.content_version}} text={card.example.text_en}/>{revealed&&<View className='muted review-translation'>{translations[card.example.id]||'暂无例句译文'}</View>}</>:<View className='muted small'>暂无例句</View>}{revealed?<><View className='row'>{[['again','忘记了'],['hard','有点难'],['good','记得'],['easy','很简单']].map(([rating,label])=><Button className='btn' key={rating} disabled={busy||hasPending||!meanings[card.child_word_id]} onClick={()=>run(async()=>{const body={session_id:session.id,card_id:card.id,event_id:eventId(),expected_version:card.version,rating,lease_generation:session.lease_generation};storage.set(pendingKey,body);setHasPending(true);await send(body);})}>{label}</Button>)}</View></>:<Button className='btn primary' disabled={busy} onClick={()=>run(async()=>{const w=await api(`/children/${session.child_id}/words/${card.child_word_id}`);setMeanings(m=>({...m,[w.id]:w.meaning_zh}));let example=w.example;
 // Older running servers omit example on the detail response; their word list
 // already includes translations. Only use an exact sentence/version match.
 if(card.example&&example===undefined){const list=await api(`/children/${session.child_id}/words`);example=list.items.find((item:any)=>item.id===card.child_word_id)?.example;}
 if(example&&example.id===card.example?.id&&example.content_version===card.example?.content_version)setTranslations(t=>({...t,[example.id]:example.translation_zh}));setRevealed(true);})}>查看词义</Button>}</>:<View className='meaning'>{busy?'正在加载…':'这组复习完成了'}</View>}<Button className='btn' disabled={busy||hasPending} onClick={()=>run(async()=>{await api(`/study-sessions/${session.id}/end`,'POST',{lease_generation:session.lease_generation});Taro.removeStorageSync(activeKey);exit();})}>{card?'结束本次复习':'完成'}</Button></View>}
  </View>;
}
