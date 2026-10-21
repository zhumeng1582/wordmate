import {useState} from 'react';
import {View,Text,Button} from '@tarojs/components';
import {selectRange,monthDays} from '../services/date-range';
import type {DateRange} from '../services/date-range';
import './DateRangeCalendar.css';
export function DateRangeCalendar({value,onConfirm,onClose}:{value:DateRange;onConfirm:(range:DateRange)=>void;onClose:()=>void}){
 const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
 const [range,setRange]=useState(value),[month,setMonth]=useState(value.start?.slice(0,7)||today.slice(0,7));
 const {offset,count}=monthDays(month);
 const move=(step:number)=>{const d=new Date(`${month}-01T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+step);setMonth(d.toISOString().slice(0,7));};
 return <View className='range-mask' catchMove onClick={onClose}><View className='range-sheet' onClick={e=>e.stopPropagation()}>
 <View className='range-heading'><Button className='text-action' onClick={onClose}>取消</Button><Text>日期范围</Text><Button className='text-action' disabled={!range.start||!range.end} onClick={()=>onConfirm(range)}>确定</Button></View>
 <View className='muted'>{range.start?`${range.start} — ${range.end||'请选择结束日期'}`:'请选择开始日期'}</View>
 <View className='range-heading'><Button className='text-action' disabled={month<='2000-01'} onClick={()=>move(-1)}>‹</Button><Text>{month.replace('-',' 年 ')} 月</Text><Button className='text-action' disabled={month>=today.slice(0,7)} onClick={()=>move(1)}>›</Button></View>
 <View className='range-grid'>{['一','二','三','四','五','六','日'].map(d=><Text className='muted' key={d}>{d}</Text>)}{Array.from({length:offset},(_,i)=><View key={`blank-${i}`}/>)}{Array.from({length:count},(_,i)=>{const day=`${month}-${String(i+1).padStart(2,'0')}`,edge=day===range.start||day===range.end,inside=!!range.end&&day>range.start&&day<range.end;return <Button key={day} className={`range-day ${edge?'range-edge':''} ${inside?'range-inside':''}`} disabled={day>today} onClick={()=>setRange(old=>selectRange(old,day))}>{i+1}</Button>;})}</View>
 <View className='muted small'>{range.end?'再次点击日期可重新选择范围':'依次点击开始和结束日期，可跨月选择'}</View>
 <Button className='text-action' onClick={()=>onConfirm({start:'',end:''})}>全部日期</Button>
 </View></View>;
}
