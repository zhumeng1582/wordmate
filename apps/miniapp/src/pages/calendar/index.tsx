import {useRef,useState} from 'react';
import {View,Text,Button,Picker} from '@tarojs/components';
import Taro,{useDidShow} from '@tarojs/taro';
import {api,storage,go,message} from '../../services/api';
import './index.css';
const localToday=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
export default function Calendar(){
 const [month,setMonth]=useState(localToday().slice(0,7)),[selected,setSelected]=useState(localToday()),[data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);const serial=useRef(0);
 const load=async(m=month)=>{const n=++serial.current;setBusy(true);setError('');setData(null);try{const value=await api(`/children/${storage.get('child_id')}/calendar?month=${m}`);if(n===serial.current)setData(value);}catch(e){if(n===serial.current)setError(message(e));}finally{if(n===serial.current)setBusy(false);}};
 useDidShow(()=>{void load();});
 const change=(m:string)=>{setMonth(m);setSelected(`${m}-01`);void load(m);};
 const move=(n:number)=>{const d=new Date(`${month}-01T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+n);change(d.toISOString().slice(0,7));};
 const day=data?.days.find((d:any)=>d.date===selected),offset=(new Date(`${month}-01T00:00:00Z`).getUTCDay()+6)%7;
 return <View className='page history-page'><View className='row month-heading'><Picker mode='date' fields='month' start='2000-01' end={localToday().slice(0,7)} value={month} onChange={e=>change(e.detail.value)}><Text>{month.replace('-',' 年 ')} 月 ▾</Text></Picker><Button className='btn month-arrow' disabled={busy||month==='2000-01'} onClick={()=>move(-1)}>‹</Button><Button className='btn month-arrow' disabled={busy||month>=localToday().slice(0,7)} onClick={()=>move(1)}>›</Button></View>
 <View className='title'>每一天，都有迹可循</View>{error&&<View className='error'>{error}<Button className='btn' onClick={()=>load()}>重新加载</Button></View>}{busy&&<View className='muted'>正在读取学习记录…</View>}
 {data&&<><View className='calendar-grid card'>{['一','二','三','四','五','六','日'].map(x=><View key={x} className='calendar-week'>{x}</View>)}{Array.from({length:offset},(_,i)=><View key={`blank${i}`}/>)}{data.days.map((d:any)=><View key={d.date} className={`calendar-day ${d.date===selected?'selected':''} ${d.checked_in?'checked':''}`} onClick={()=>setSelected(d.date)}><Text>{Number(d.date.slice(8))}</Text><View className='day-marker'>{d.checked_in?'✓':d.studied_words?'·':''}{d.wrong_words?' !':''}</View></View>)}</View>
 <View className='muted small'>✓ 已打卡　· 有学习　! 有错题</View>{day&&<View className='card history-highlight'><View className='history-name'>{selected.slice(5).replace('-',' 月 ')} 日 · {day.checked_in?'已打卡':day.studied_words?'学习中':'未打卡'}</View><View>学习 {day.studied_words} 词{day.goal?` / 目标 ${day.goal} 词`:''} · 错词 {day.wrong_words} 个 / 错误 {day.mistake_count} 次</View><View className='muted'>已提交月测 {day.quiz_count} 次 · 月测不计入打卡</View></View>}
 <View className='muted'>当前连续打卡 {data.streak_days} 天{data.streak_through?` · 截至 ${data.streak_through}`:''}</View><View className='card' onClick={()=>go('quiz')}><View className='history-name'>本月复习测验 ›</View><View>抽样或全量，看看记住了多少。</View></View>
 <View className='history-actions'><Button className='btn primary' disabled={!day?.wrong_words} onClick={()=>Taro.navigateTo({url:`/pages/wrong/index?date=${selected}`})}>查看 / 复习这天错词</Button><Button className='btn' onClick={()=>go('wrong')}>全部历史错题</Button></View></>}
 </View>;
}
