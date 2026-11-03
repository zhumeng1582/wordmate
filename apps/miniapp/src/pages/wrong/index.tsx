import {Chevron} from '../../components/Chevron';
import {DateRangeCalendar} from '../../components/DateRangeCalendar';
import {useRef,useState} from 'react';
import {View,Button,Picker,Text} from '@tarojs/components';
import Taro,{useDidShow,useDidHide,useRouter} from '@tarojs/taro';
import {api,storage,message} from '../../services/api';
import {refreshVisiblePages} from '../../services/visible-pages';
import '../calendar/index.css';
export default function Wrong(){
 const router=useRouter(),initial=router.params.date_from||router.params.date||'';
 const [range,setRange]=useState({start:initial,end:router.params.date_to||initial}),[calendarOpen,setCalendarOpen]=useState(false),[source,setSource]=useState(['review','monthly_quiz'].includes(router.params.source??'')?(router.params.source??''):''),[items,setItems]=useState<any[]>([]),[cursor,setCursor]=useState<string|null>(null),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);const serial=useRef(0),loadedScope=useRef('');
 const sources=['全部来源','日常复习','月测'],values=['','review','monthly_quiz'];
 const load=async(d=range,s=source,after?:string,quiet=false)=>{
  const n=++serial.current,child=storage.get('child_id'),key=`${storage.get('access_token')}:${child}:${d.start}:${d.end}:${s}`,changed=loadedScope.current!==key,current=()=>n===serial.current&&key===`${storage.get('access_token')}:${storage.get('child_id')}:${d.start}:${d.end}:${s}`;
  if(!quiet||changed||!loaded)setBusy(true);if(!quiet||changed)setError('');
  if(changed){loadedScope.current=key;setLoaded(false);setItems([]);setCursor(null);setSelected([]);}
  try{
   const read=(cursor?:string)=>{const query=[d.start&&d.end?`date_from=${d.start}&date_to=${d.end}`:'',s?`source=${s}`:'',cursor?`cursor=${encodeURIComponent(cursor)}`:'','limit=50'].filter(Boolean).join('&');return api(`/children/${child}/wrong-words?${query}`);};
   const data=after?await read(after):await refreshVisiblePages(read,changed?50:Math.max(50,items.length),current);
   if(!data||!current())return;
   setItems(old=>after?[...old,...data.items.filter((item:any)=>!old.some(previous=>previous.word.id===item.word.id))]:data.items);setCursor(data.next_cursor);setLoaded(true);setError('');
   if(!after)setSelected(old=>old.filter(id=>data.items.some((item:any)=>item.word.id===id&&!item.word.archived_at)));
  }catch(e){if(current())setError(message(e));}finally{if(n===serial.current)setBusy(false);}
 };
 useDidShow(()=>{void load(range,source,undefined,true);});useDidHide(()=>{serial.current++;});
 const launch=(selection:any)=>{storage.set('review_source',selection);storage.set('study_intent','start');Taro.navigateTo({url:'/pages/review/index'});};
 const toggle=(id:string)=>setSelected(old=>old.includes(id)?old.filter(x=>x!==id):old.length<100?[...old,id]:old);
 return <View className='page history-page'><View className='row'><Button className='text-action' onClick={()=>setCalendarOpen(true)}>{range.start?(range.start===range.end?range.start:`${range.start} 至 ${range.end}`):'全部日期'}<Chevron direction='down'/></Button><Picker mode='selector' range={sources} value={values.indexOf(source)} onChange={e=>{const s=values[Number(e.detail.value)];setSource(s);void load(range,s);}}><Text className='indicator-label'>{sources[values.indexOf(source)]}<Chevron direction='down'/></Text></Picker></View>
 <View className='title'>错题集</View>{error&&<View className='error'>{error}<Button className='btn' onClick={()=>load()}>重新加载</Button></View>}{busy&&!loaded&&<View className='card list-placeholder muted'>正在读取错题…</View>}
 {items.map(item=><View className={`card ${selected.includes(item.word.id)?'history-highlight':''}`} key={item.word.id} onClick={()=>!item.word.archived_at&&toggle(item.word.id)}><View className='history-toggle'><View className='history-name'>{item.word.lemma}　{item.word.meaning_zh}</View><Text>{item.word.archived_at?'已归档':selected.includes(item.word.id)?'✓':'○'}</Text></View><View className='muted'>{item.word.part_of_speech} · 错 {item.wrong_count} 次{item.unanswered_count?`（含未答 ${item.unanswered_count} 次）`:''} · {item.sources.map((s:string)=>s==='review'?'复习':'月测').join(' / ')}</View><View className='muted small'>最近出错：{new Date(item.last_wrong_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</View>{item.correct_since_last_mistake&&<View className='muted'>之后已答对，历史仍保留</View>}</View>)}
 {loaded&&!items.length&&<View className='card'>这个范围还没有错题。</View>}{cursor&&<Button className='btn' disabled={busy} onClick={()=>load(range,source,cursor)}>{busy?'正在加载…':'加载更多'}</Button>}
 {items.length>0&&<View className='muted small'>答对后仍保留历史；未到期的词只练习，不改变复习计划。</View>}
 <View className='history-actions'>{!!items.length&&<Button className='btn secondary' disabled={busy} onClick={()=>setSelected(items.filter(x=>!x.word.archived_at).slice(0,100).map(x=>x.word.id))}>选择已加载的词（最多 100 个）</Button>}{selected.length>0&&<Button className='btn primary' disabled={busy} onClick={()=>launch({source:'manual',word_ids:selected})}>复习选中错词（{selected.length}）</Button>}{range.start&&range.end&&!!items.length&&<Button className='btn' disabled={busy} onClick={()=>launch({source:'calendar',date_from:range.start,date_to:range.end,scope:'mistakes',...(source?{mistake_source:source}:{})})}>复习这段时间的错词</Button>}</View>
 {calendarOpen&&<DateRangeCalendar value={range} mode='wrong' source={source} onClose={()=>setCalendarOpen(false)} onConfirm={value=>{setRange(value);setCalendarOpen(false);void load(value,source);}}/>}
 </View>;
}
