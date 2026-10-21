import {DateRangeCalendar} from '../../components/DateRangeCalendar';
import {useRef,useState} from 'react';
import {View,Button,Picker,Text} from '@tarojs/components';
import Taro,{useDidShow,useRouter} from '@tarojs/taro';
import {api,storage,message} from '../../services/api';
import '../calendar/index.css';
export default function Wrong(){
 const router=useRouter(),initial=router.params.date||'';
 const [range,setRange]=useState({start:initial,end:initial}),[calendarOpen,setCalendarOpen]=useState(false),[source,setSource]=useState(''),[items,setItems]=useState<any[]>([]),[cursor,setCursor]=useState<string|null>(null),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);const serial=useRef(0);
 const sources=['全部来源','日常复习','月测'],values=['','review','monthly_quiz'];
 const load=async(d=range,s=source,after?:string)=>{const n=++serial.current;setBusy(true);setError('');if(!after){setLoaded(false);setItems([]);setSelected([]);}try{const query=[d.start&&d.end?`date_from=${d.start}&date_to=${d.end}`:'',s?`source=${s}`:'',after?`cursor=${encodeURIComponent(after)}`:'','limit=50'].filter(Boolean).join('&');const data=await api(`/children/${storage.get('child_id')}/wrong-words?${query}`);if(n!==serial.current)return;setItems(old=>after?[...old,...data.items]:data.items);setCursor(data.next_cursor);setLoaded(true);}catch(e){if(n===serial.current)setError(message(e));}finally{if(n===serial.current)setBusy(false);}};
 useDidShow(()=>{void load();});
 const launch=(selection:any)=>{storage.set('review_source',selection);Taro.navigateTo({url:'/pages/review/index'});};
 const toggle=(id:string)=>setSelected(old=>old.includes(id)?old.filter(x=>x!==id):old.length<100?[...old,id]:old);
 return <View className='page history-page'><View className='row'><Button className='text-action' onClick={()=>setCalendarOpen(true)}>{range.start?(range.start===range.end?range.start:`${range.start} 至 ${range.end}`):'全部日期'} ▾</Button><Picker mode='selector' range={sources} value={values.indexOf(source)} onChange={e=>{const s=values[Number(e.detail.value)];setSource(s);void load(range,s);}}><Text>{sources[values.indexOf(source)]} ▾</Text></Picker></View>
 <View className='title'>错过的，再见一面</View>{error&&<View className='error'>{error}<Button className='btn' onClick={()=>load()}>重新加载</Button></View>}{busy&&<View className='muted'>正在读取错题…</View>}
 {items.map(item=><View className={`card ${selected.includes(item.word.id)?'history-highlight':''}`} key={item.word.id} onClick={()=>!item.word.archived_at&&toggle(item.word.id)}><View className='history-toggle'><View className='history-name'>{item.word.lemma}　{item.word.meaning_zh}</View><Text>{item.word.archived_at?'已归档':selected.includes(item.word.id)?'✓':'○'}</Text></View><View className='muted'>{item.word.part_of_speech} · 错 {item.wrong_count} 次{item.unanswered_count?`（含未答 ${item.unanswered_count} 次）`:''} · {item.sources.map((s:string)=>s==='review'?'复习':'月测').join(' / ')}</View><View className='muted small'>最近出错：{new Date(item.last_wrong_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</View>{item.correct_since_last_mistake&&<View className='muted'>之后已答对，历史仍保留</View>}</View>)}
 {loaded&&!items.length&&<View className='card'>这个范围还没有错题。</View>}{cursor&&<Button className='btn' disabled={busy} onClick={()=>load(range,source,cursor)}>加载更多</Button>}
 {items.length>0&&<View className='muted small'>答对后仍保留历史；未到期的词只练习，不改变复习计划。</View>}
 <View className='history-actions'>{!!items.length&&<Button className='btn secondary' disabled={busy} onClick={()=>setSelected(items.filter(x=>!x.word.archived_at).slice(0,100).map(x=>x.word.id))}>选择已加载的词（最多 100 个）</Button>}{selected.length>0&&<Button className='btn primary' disabled={busy} onClick={()=>launch({source:'manual',word_ids:selected})}>复习选中错词（{selected.length}）</Button>}{range.start&&range.start===range.end&&!source&&!!items.length&&<Button className='btn' disabled={busy} onClick={()=>launch({source:'calendar',date:range.start})}>复习这天全部错词</Button>}</View>
 {calendarOpen&&<DateRangeCalendar value={range} onClose={()=>setCalendarOpen(false)} onConfirm={value=>{setRange(value);setCalendarOpen(false);void load(value,source);}}/>}
 </View>;
}
