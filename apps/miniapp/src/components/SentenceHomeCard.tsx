import {HomeContentPlaceholder} from './HomeContentPlaceholder';
import {homeEmptyState,validHomeTotals,type HomeBook} from '../services/home-content';
import {Chevron} from './Chevron';
import {useEffect,useRef,useState} from 'react';
import Taro,{useDidShow,useDidHide} from '@tarojs/taro';
import {View,Text,Button} from '@tarojs/components';
import {api,message,storage} from '../services/api';
import {sentenceScope} from '../services/sentence-learning';
export function SentenceHomeCard({onEmptyChange}:{onEmptyChange?:(empty:boolean|null)=>void}={}){
 const [data,setData]=useState<any>(null),[book,setBook]=useState<any>(null),[stats,setStats]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[books,setBooks]=useState<HomeBook[]>([]);const seq=useRef(0),scope=()=>`${sentenceScope(storage)}:${storage.get('family_id')}`,owner=useRef(''),inFlight=useRef(false);
 const notify=useRef(onEmptyChange);notify.current=onEmptyChange;
 const load=async()=>{
  const key=scope();if(inFlight.current&&owner.current===key)return;
  inFlight.current=true;const n=++seq.current,bookKey=`current_sentence_book:${storage.get('child_id')}`;let expectedBook=storage.get(bookKey);
  const valid=()=>n===seq.current&&key===scope()&&expectedBook===storage.get(bookKey);
  if(owner.current!==key||!stats||expectedBook&&expectedBook!==book?.id)setBusy(true);
  if(owner.current!==key||expectedBook&&expectedBook!==book?.id){owner.current=key;setData(null);setBook(null);setStats(null);setBooks([]);notify.current?.(null);}
  try{
   const result=await api(`/children/${storage.get('child_id')}/sentence-books`);if(!valid())return;
   if(!Array.isArray(result.items))throw Error('句子本暂时无法加载，请重试。');setBooks(result.items);
   const selected=result.items.find((b:any)=>b.id===expectedBook)??result.items[0];
   if(!selected){expectedBook='';storage.set(bookKey,'');setBook(null);setData(null);setStats({total:0,learned:0});setError('');notify.current?.(true);return;}
   if(book&&book.id!==selected.id){setBusy(true);setData(null);setStats(null);notify.current?.(null);}
   expectedBook=selected.id;storage.set(bookKey,selected.id);
   const [progress,list]=await Promise.all([api(`/children/${storage.get('child_id')}/sentence-progress?book_id=${selected.id}`),api(`/children/${storage.get('child_id')}/sentences?book_id=${selected.id}&limit=1`)]);if(!valid())return;
   if(!validHomeTotals(list.total,list.learned))throw Error('句子统计暂时不可用，请重试。');
   setBook(selected);setData(progress);setStats(list);setError('');notify.current?.(homeEmptyState('sentences',list.total,result.items,selected.id)==='empty');
  }catch(e){if(valid()){setError(message(e));notify.current?.(null);}}
  finally{if(n===seq.current&&key===scope()){inFlight.current=false;setBusy(false);}}
 };

 useEffect(()=>{void load();return()=>{seq.current++;inFlight.current=false;};},[]);useDidShow(()=>{void load();});useDidHide(()=>{seq.current++;inFlight.current=false;});
 const start=(source:string)=>{if(busy||error||!book||owner.current!==scope())return;void Taro.navigateTo({url:`/pages/sentence-study/index?source=${source}&bookId=${book.id}`});};
 const viewGeneration=seq.current;
 const empty=homeEmptyState('sentences',stats?.total??null,books,book?.id||'');
 if(error||!stats||empty)return <HomeContentPlaceholder kind='sentences' state={error?'error':!stats?'loading':empty!} error={error} bookName={book?.name} books={books} bookId={book?.id} onRetry={()=>void load()} onSwitch={id=>{if(viewGeneration!==seq.current||inFlight.current||owner.current!==scope()||!books.some(value=>value.id===id))return;storage.set(`current_sentence_book:${storage.get('child_id')}`,id);void load();}}/>;
 const canReview=!!stats.learned||!!data?.due_count||!!data?.active_round||!!data?.completed;
 return <View className='card home-progress-card' data-kind='sentences'><Button className='home-current-book' onClick={()=>void Taro.navigateTo({url:'/pages/sentences/index'})}><Text className='home-word-heading'>英语常用句</Text><Text className='home-book-name'>{book?.name||'正在读取句子本…'}</Text><Text className='home-book-stats'>{stats?`已学 ${stats.learned} 句 · 共 ${stats.total} 句`:'统计加载中'}</Text><Chevron className='home-book-chevron'/></Button><View className='home-progress-summary'><Text className='home-progress-label'>今日累计</Text><View className='progress'>{data?<>{data.completed}<Text className='home-goal'> / {data.goal} 句</Text></>:<Text className='home-goal'>进度暂不可用</Text>}</View></View><View className={`home-learning-actions ${canReview?'':'home-learning-actions-single'}`}><Button className='home-study-button home-learn-button' disabled={busy||!!error||!book||!data?.new_count&&!data?.active_round} onClick={()=>start('new')}><Text className='home-action-title'>{data?.active_round?'继续学习':'学习新句'}</Text><Text className='home-action-detail'>{data?.new_count?`本轮 ${Math.min(data.new_count,data.daily_goal)} 句`:data?.active_round?'继续上次进度':'暂无未学句子'}</Text></Button>{canReview&&<Button className='home-study-button home-review-button' disabled={busy||!!error||!book} onClick={()=>data?.due_count||data?.active_round?start('review'):void Taro.navigateTo({url:'/pages/calendar/index?kind=sentences'})}><Text className='home-action-title'>复习句子</Text><Text className='home-action-detail'>{data?.due_count?`${data.due_count} 句待复习`:'按日期复习'}</Text></Button>}</View>{error&&<View className='error'>{error}<Button className='text-action' onClick={()=>void load()}>重新加载</Button></View>}<View className='home-checkin'><View className='home-checkin-row'><Text>{data?(data.checked_in?'✓ 今日句子已打卡':'今日句子未打卡'):'正在读取打卡状态…'}</Text><Text>{data?`连续 ${data.streak_days} 天 · 累计 ${data.total_days??0} 天`:''}</Text></View></View></View>;
}
