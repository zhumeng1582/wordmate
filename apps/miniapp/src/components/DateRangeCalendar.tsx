import {Chevron} from './Chevron';
import {useEffect,useRef,useState} from 'react';
import {View,Text,Button,Picker} from '@tarojs/components';
import {selectRange,monthDays,recentRange,rangeLabel,type DateRange} from '../services/date-range';
import {api,storage} from '../services/api';
import './DateRangeCalendar.css';
type Mode='review'|'wrong'|'makeup';
export function DateRangeGrid({value,onChange,month,onMonthChange,today,days=[],mode='review',unit='词',disabled=false}:{value:DateRange;onChange:(range:DateRange)=>void;month:string;onMonthChange:(month:string)=>void;today:string;days?:any[];mode?:Mode;unit?:'词'|'字'|'句';disabled?:boolean}){
 const {offset,count}=monthDays(month),records=new Map(days.map(day=>[day.date,day]));
 const move=(step:number)=>{const d=new Date(`${month}-01T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+step);onMonthChange(d.toISOString().slice(0,7));};
 const preset=(range:DateRange)=>{onChange(range);};
 return <View className='date-range-grid'>
  {mode!=='makeup'&&<View className='range-presets'>{(['今天','近7天','本月'] as const).map((label,index)=><Button key={label} className='range-preset' onClick={()=>preset(index===0?{start:today,end:today}:index===1?recentRange(today):{start:`${today.slice(0,7)}-01`,end:today})}>{label}</Button>)}</View>}
  <View className='range-selection'>{mode==='makeup'?(value.start||'选择要补卡的日期'):rangeLabel(value)}</View>
  <View className='range-heading range-month'><Button className='text-action chevron-button' aria-label='上个月' disabled={disabled||month<='2000-01'} onClick={()=>move(-1)}><Chevron direction='left'/></Button><Picker disabled={disabled} mode='date' fields='month' start='2000-01' end={today.slice(0,7)} value={month} onChange={event=>onMonthChange(event.detail.value)}><View className='range-month-label'><Text>{month.replace('-',' 年 ')} 月</Text><Chevron direction='down'/></View></Picker><Button className='text-action chevron-button' aria-label='下个月' disabled={disabled||month>=today.slice(0,7)} onClick={()=>move(1)}><Chevron/></Button></View>
  <View className='range-grid'>{['一','二','三','四','五','六','日'].map(day=><Text className='range-week' key={day}>{day}</Text>)}{Array.from({length:offset},(_,index)=><View key={`blank-${index}`}/>)}{Array.from({length:count},(_,index)=>{
   const date=`${month}-${String(index+1).padStart(2,'0')}`,edge=date===value.start||date===value.end,inside=!!value.end&&date>value.start&&date<value.end,record=records.get(date),words=mode==='wrong'?record?.wrong_words:record?.reviewable_words??record?.studied_words;
   return <Button key={date} data-date={date} aria-pressed={edge||inside} className={`range-day ${edge?'range-edge':''} ${inside?'range-inside':''}`} disabled={disabled||(mode==='makeup'?date>=today||!!record?.checked_in:date>today)} onClick={()=>{if(disabled||date>today||mode==='makeup'&&(date>=today||record?.checked_in))return;onChange(mode==='makeup'?{start:date,end:date}:selectRange(value,date));}}><Text>{index+1}</Text><Text className='range-activity'>{mode==='makeup'?(record?.makeup?'已补卡':record?.checked_in?'已打卡':date===today?'今天':date<today?'可补卡':''):(words?`${words}${unit}`:'')}</Text></Button>;
  })}</View>
 </View>;
}
export function DateRangeCalendar({value,onConfirm,onClose,mode='wrong',source=''}:{value:DateRange;onConfirm:(range:DateRange)=>void;onClose:()=>void;mode?:Mode;source?:string}){
 const localToday=new Date(Date.now()+8*3600000).toISOString().slice(0,10),scope=`${storage.get('access_token')}:${storage.get('child_id')}`;
 const [range,setRange]=useState(value),[month,setMonth]=useState(value.start?.slice(0,7)||localToday.slice(0,7)),[data,setData]=useState<any>(null),[error,setError]=useState('');const serial=useRef(0);
 useEffect(()=>{const ticket=++serial.current;setData(null);setError('');void api(`/children/${storage.get('child_id')}/calendar?month=${month}${mode==='wrong'&&source?`&source=${source}`:''}`).then(result=>{if(ticket===serial.current&&scope===`${storage.get('access_token')}:${storage.get('child_id')}`)setData(result);}).catch(()=>{if(ticket===serial.current)setError('日期记录暂时无法加载，可继续选择日期。');});return()=>{serial.current++;};},[scope,month,source,mode]);
 const change=(next:DateRange)=>{setRange(next);if(next.end)setMonth(next.end.slice(0,7));};
 return <View className='range-mask' catchMove onClick={onClose}><View className='range-sheet' onClick={event=>event.stopPropagation()}>
  <View className='range-heading'><Button className='text-action' onClick={onClose}>取消</Button><Text>{mode==='wrong'?'错词日期':'复习日期'}</Text><Button className='text-action' disabled={!range.start||!range.end} onClick={()=>onConfirm(range)}>确定</Button></View>
  <DateRangeGrid value={range} onChange={change} month={month} onMonthChange={setMonth} today={data?.today??localToday} days={data?.days} mode={mode}/>
  {error&&<View className='muted small'>{error}</View>}<Button className='text-action' onClick={()=>onConfirm({start:'',end:''})}>全部日期</Button>
 </View></View>;
}
