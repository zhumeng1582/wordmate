import {useRef,useState} from 'react';
import {View,Button,Text} from '@tarojs/components';
import Taro,{useDidShow,useDidHide,useRouter} from '@tarojs/taro';
import {DateRangeGrid} from '../../components/DateRangeCalendar';
import {api,storage,message,eventId} from '../../services/api';
import type {DateRange} from '../../services/date-range';
import './index.css';
const valueEncode=(value:string)=>encodeURIComponent(value);
const localToday=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const emptyRange=():DateRange=>({start:'',end:''});
export default function Calendar(){
 const {params}=useRouter(),mode=params.mode==='makeup'?'makeup':params.mode==='wrong'?'wrong':'review',makeupMode=mode==='makeup',source=mode==='wrong'&&['review','monthly_quiz'].includes(params.source??'')?params.source:'';
 const [kind,setKind]=useState<'words'|'hanzi'|'sentences'>(params.kind==='sentences'?'sentences':params.kind==='hanzi'?'hanzi':'words'),kindRef=useRef(kind),hanzi=kind==='hanzi',sentences=kind==='sentences';
 const initial=params.date_from??params.date??localToday(),[range,setRange]=useState<DateRange>(makeupMode?emptyRange():{start:initial,end:params.date_to??initial}),[month,setMonth]=useState(initial.slice(0,7));
 const [data,setData]=useState<any>(null),[summary,setSummary]=useState<any>(null),[busy,setBusy]=useState(false),[usingCredit,setUsingCredit]=useState(false),[error,setError]=useState('');
 const serial=useRef(0),monthCache=useRef<{key:string;data:any}|null>(null),launchLock=useRef(false),makeupLock=useRef(false),makeupSeq=useRef(0),active=useRef(true),owner=useRef(''),pending=useRef<{owner:string;date:string;id:string}|null>(null);
 const scope=()=>`${storage.get('access_token')}:${storage.get('child_id')}`,identity=()=>`${scope()}:${kindRef.current}`,rangeKey=(value:DateRange)=>`${identity()}:${mode}:${source}:${value.start}:${value.end}`;
 const load=async(value=range,m=month,quiet=false,target=kindRef.current)=>{
  const ticket=++serial.current,context=identity(),key=`${context}:${m}:${source}`,selected=rangeKey(value),changed=monthCache.current?.key!==key,isHanzi=target==='hanzi',isSentence=target==='sentences';
  if(!storage.get('access_token')||!storage.get('child_id')){setData(null);setSummary(null);setBusy(false);setError('请先登录并选择孩子。');return;}
  if(changed)setData(null);if(summary?.key!==selected)setSummary(null);if(!quiet||changed||!data)setBusy(true);if(!quiet||changed)setError('');
  try{
   const query=`date_from=${value.start}&date_to=${value.end}${isHanzi||isSentence?'':`&scope=${mode==='wrong'?'mistakes':'studied'}${source?`&source=${source}`:''}`}`;
   const suffix=[m?`month=${m}`:'',!isHanzi&&source?`source=${source}`:''].filter(Boolean).join('&');
   const [calendar,selection]=await Promise.all([!quiet&&monthCache.current?.key===key?Promise.resolve(monthCache.current.data):api(`/children/${storage.get('child_id')}/${isSentence?'sentence-calendar':isHanzi?'hanzi-calendar':'calendar'}${suffix?`?${suffix}`:''}`),!makeupMode&&value.start&&value.end?api(`/children/${storage.get('child_id')}/${isSentence?'sentence-history-range':isHanzi?'hanzi-history-range':'history-range'}?${query}${isHanzi?'&limit=1':''}`):Promise.resolve(null)]);
   if(ticket!==serial.current||context!==identity()||!active.current)return;
   monthCache.current={key:`${context}:${calendar.month??m}:${source}`,data:calendar};setData({...calendar,context});if(makeupMode&&calendar.month)setMonth(calendar.month);setSummary(selection?{...selection,key:selected}:null);setError('');
  }catch(e){if(ticket===serial.current&&context===identity()&&active.current)setError(message(e));}finally{if(ticket===serial.current&&active.current)setBusy(false);}
 };
 useDidShow(()=>{active.current=true;launchLock.current=false;const changed=owner.current!==scope();owner.current=scope();if(changed&&makeupMode){monthCache.current=null;setRange(emptyRange());setData(null);pending.current=null;void load(emptyRange(),'',true);}else void load(range,month,true);});
 useDidHide(()=>{active.current=false;serial.current++;makeupSeq.current++;makeupLock.current=false;setUsingCredit(false);});
 const currentData=data?.context===identity()?data:null;
 const changeRange=(value:DateRange)=>{if(makeupMode){const day=currentData?.days?.find((d:any)=>d.date===value.start);if(!day||value.start!==value.end||value.start>=currentData.today||day.checked_in||usingCredit)return;}const m=value.end?.slice(0,7)||month;setRange(value);setMonth(m);if(!makeupMode)void load(value,m);};
 const changeMonth=(m:string)=>{if(usingCredit||m>(currentData?.today??localToday()).slice(0,7))return;setMonth(m);if(makeupMode)setRange(emptyRange());void load(makeupMode?emptyRange():range,m);};
 const changeKind=(next:'words'|'hanzi'|'sentences')=>{if(makeupLock.current||busy||next===kindRef.current)return;serial.current++;kindRef.current=next;setKind(next);monthCache.current=null;pending.current=null;setData(null);setSummary(null);setRange(emptyRange());void load(emptyRange(),month,false,next);};
 const count=summary?.key===rangeKey(range)?summary.count:0,complete=!!range.start&&!!range.end,selectedDay=currentData?.days?.find((d:any)=>d.date===range.start);
 const canMakeup=!!currentData&&!!selectedDay&&range.start===range.end&&range.start<currentData.today&&!selectedDay.checked_in&&currentData.makeup_credits>0;
 const useMakeup=async()=>{
  if(!active.current||makeupLock.current||busy||!canMakeup||owner.current!==scope())return;makeupLock.current=true;setUsingCredit(true);setError('');const key=identity(),ticket=++makeupSeq.current,date=range.start,current=()=>active.current&&key===identity()&&ticket===makeupSeq.current;
  try{const confirmation=await Taro.showModal({title:sentences?'句子补卡':hanzi?'汉字补卡':'单词补卡',content:`使用 1 次${sentences?'句子':hanzi?'汉字':'单词'}补卡机会补上 ${date}？补卡不增加学习数量。`,confirmText:'确认补卡'});if(!confirmation.confirm||!current())return;
   if(!pending.current||pending.current.owner!==key||pending.current.date!==date)pending.current={owner:key,date,id:eventId()};
   await api(`/children/${storage.get('child_id')}/${sentences?'sentence-checkin-makeup':hanzi?'hanzi-checkin-makeup':'checkin-makeup'}`,'POST',{date},pending.current.id);
   if(current()){pending.current=null;monthCache.current=null;setRange(emptyRange());await load(emptyRange(),month,true);if(current())Taro.showToast({title:'补卡成功',icon:'success'});}
  }catch(e){if(current())setError(message(e));}finally{if(ticket===makeupSeq.current){makeupLock.current=false;setUsingCredit(false);}}
 };
 const launch=async()=>{
  if(launchLock.current||busy||!complete||!count)return;launchLock.current=true;
  try{
   if(sentences){await Taro.navigateTo({url:`/pages/sentence-study/index?source=history&date_from=${range.start}&date_to=${range.end}`});return;}
   if(hanzi){await Taro.navigateTo({url:`/pages/hanzi-study/index?source=history&date_from=${valueEncode(range.start)}&date_to=${valueEncode(range.end)}`});return;}
   if(mode==='wrong'){await Taro.navigateTo({url:`/pages/wrong/index?date_from=${range.start}&date_to=${range.end}${source?`&source=${source}`:''}`});return;}
   storage.set('review_source',{source:'calendar',date_from:range.start,date_to:range.end,scope:'studied'});storage.set('study_intent','start');await Taro.navigateTo({url:'/pages/review/index'});
  }catch{setError('暂时无法打开，请重试。');}finally{launchLock.current=false;}
 };
 return <View className='page history-page calendar-page'>
  <View className='title'>{makeupMode?'打卡与补卡':sentences?'句子学习日历':hanzi?'汉字学习日历':mode==='wrong'?'错词日期':'按日期复习'}</View>
  {makeupMode&&<><View className='makeup-kinds'>{(['words','hanzi','sentences'] as const).map(value=><Button key={value} className={`makeup-kind ${kind===value?'selected':''}`} disabled={busy||usingCredit} onClick={()=>changeKind(value)}>{value==='words'?'单词打卡':value==='sentences'?'句子打卡':'汉字打卡'}</Button>)}</View><View className='muted small'>单词、汉字和句子的补卡机会分别计算。只能补今天之前尚未打卡的日期。</View><View className='makeup-balance'>{currentData?`可用补卡 ${currentData.makeup_credits??0} 次`:'正在读取打卡记录…'}</View></>}
  {error&&<View className='error'>{error}<Button className='text-action' disabled={usingCredit} onClick={()=>void load()}>重试</Button></View>}
  <View className='card calendar-range-card'><DateRangeGrid value={range} onChange={changeRange} month={month} onMonthChange={changeMonth} today={currentData?.today??localToday()} days={currentData?.days} mode={mode} unit={sentences?'句':hanzi?'字':'词'} disabled={makeupMode&&(!currentData||busy||usingCredit)}/></View>
  {makeupMode?<View className='calendar-result'><Button className='btn primary' disabled={busy||usingCredit||!canMakeup} onClick={()=>void useMakeup()}>{usingCredit?'正在补卡…':currentData?.makeup_credits===0?'暂无可用补卡机会':range.start?`补卡 ${range.start}`:'请选择漏打卡的日期'}</Button><View className='muted small'>连续实际达标可获得补卡机会；补卡只修复打卡记录，不增加学习数量。</View></View>:<View className='calendar-result'>
   {!complete?<View className='muted'>选择结束日期</View>:busy&&!summary?<View className='muted'>正在读取{mode==='wrong'?'错词':sentences?'句子':hanzi?'汉字':'单词'}…</View>:count>0?<>
    <View className='calendar-result-count'>{count}<Text>{sentences?' 个句子':hanzi?' 个汉字':mode==='wrong'?' 个错词':' 个单词'}</Text></View>
    <Button className='btn primary' disabled={busy} onClick={()=>void launch()}>{mode==='wrong'?'查看错词':'开始复习'}</Button>
   </>:!error&&<View className='muted'>{sentences?'所选日期没有可复习的句子':hanzi?'所选日期没有可复习的汉字':mode==='wrong'?'所选日期没有错词':'所选日期没有可复习的单词'}</View>}
  </View>}
 </View>;
}
