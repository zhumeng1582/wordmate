import {useRef,useState} from 'react';
import {View,Button,Text} from '@tarojs/components';
import Taro,{useDidShow,useDidHide,useRouter} from '@tarojs/taro';
import {DateRangeGrid} from '../../components/DateRangeCalendar';
import {api,storage,message} from '../../services/api';
import type {DateRange} from '../../services/date-range';
import './index.css';
const localToday=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
export default function Calendar(){
 const {params}=useRouter(),mode=params.mode==='wrong'?'wrong':'review',source=mode==='wrong'&&['review','monthly_quiz'].includes(params.source??'')?params.source:'';
 const initial=params.date_from??params.date??localToday(),[range,setRange]=useState<DateRange>({start:initial,end:params.date_to??initial}),[month,setMonth]=useState(initial.slice(0,7));
 const [data,setData]=useState<any>(null),[summary,setSummary]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const serial=useRef(0),monthCache=useRef<{key:string;data:any}|null>(null),launchLock=useRef(false);
 const identity=()=>`${storage.get('access_token')}:${storage.get('child_id')}`,rangeKey=(value:DateRange)=>`${identity()}:${mode}:${source}:${value.start}:${value.end}`;
 const load=async(value=range,m=month,quiet=false)=>{
  const ticket=++serial.current,context=identity(),key=`${context}:${m}:${source}`,selected=rangeKey(value),changed=monthCache.current?.key!==key;
  if(!storage.get('access_token')||!storage.get('child_id')){setData(null);setSummary(null);setError('请先选择孩子。');return;}
  if(changed)setData(null);if(summary?.key!==selected)setSummary(null);if(!quiet||changed||!data)setBusy(true);if(!quiet||changed)setError('');
  try{
   const query=`date_from=${value.start}&date_to=${value.end}&scope=${mode==='wrong'?'mistakes':'studied'}${source?`&source=${source}`:''}`;
   const [calendar,selection]=await Promise.all([!quiet&&monthCache.current?.key===key?Promise.resolve(monthCache.current.data):api(`/children/${storage.get('child_id')}/calendar?month=${m}${source?`&source=${source}`:''}`),value.start&&value.end?api(`/children/${storage.get('child_id')}/history-range?${query}`):Promise.resolve(null)]);
   if(ticket!==serial.current||context!==identity())return;
   monthCache.current={key,data:calendar};setData(calendar);setSummary(selection?{...selection,key:selected}:null);setError('');
  }catch(e){if(ticket===serial.current&&context===identity())setError(message(e));}finally{if(ticket===serial.current)setBusy(false);}
 };
 useDidShow(()=>{launchLock.current=false;void load(range,month,true);});useDidHide(()=>{serial.current++;});
 const changeRange=(value:DateRange)=>{const m=value.end?.slice(0,7)||month;setRange(value);setMonth(m);void load(value,m);};
 const changeMonth=(m:string)=>{setMonth(m);void load(range,m);};
 const count=summary?.key===rangeKey(range)?summary.count:0,complete=!!range.start&&!!range.end;
 const launch=async()=>{
  if(launchLock.current||busy||!complete||!count)return;launchLock.current=true;
  try{
   if(mode==='wrong'){await Taro.navigateTo({url:`/pages/wrong/index?date_from=${range.start}&date_to=${range.end}${source?`&source=${source}`:''}`});return;}
   storage.set('review_source',{source:'calendar',date_from:range.start,date_to:range.end,scope:'studied'});storage.set('study_intent','start');await Taro.navigateTo({url:'/pages/review/index'});
  }catch{setError('暂时无法打开，请重试。');}finally{launchLock.current=false;}
 };
 return <View className='page history-page calendar-page'>
  <View className='title'>{mode==='wrong'?'错词日期':'按日期复习'}</View>
  {error&&<View className='error'>{error}<Button className='text-action' onClick={()=>void load()}>重试</Button></View>}
  <View className='card calendar-range-card'><DateRangeGrid value={range} onChange={changeRange} month={month} onMonthChange={changeMonth} today={data?.today??localToday()} days={data?.days} mode={mode}/></View>
  <View className='calendar-result'>
   {!complete?<View className='muted'>选择结束日期</View>:busy&&!summary?<View className='muted'>正在读取{mode==='wrong'?'错词':'单词'}…</View>:count>0?<>
    <View className='calendar-result-count'>{count}<Text>{mode==='wrong'?' 个错词':' 个单词'}</Text></View>
    <Button className='btn primary' disabled={busy} onClick={()=>void launch()}>{mode==='wrong'?'查看错词':'开始复习'}</Button>
   </>:!error&&<View className='muted'>{mode==='wrong'?'所选日期没有错词':'所选日期没有可复习的单词'}</View>}
  </View>
 </View>;
}
