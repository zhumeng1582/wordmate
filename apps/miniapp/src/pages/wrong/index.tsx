import {ListLoadState} from '../../components/ListLoadState';
import {useListPagination} from '../../services/use-list-pagination';
import {LibraryItemSummary} from '../../components/LibraryItemSummary';
import {AudioFeedback} from '../../components/AudioControls';
import {useAudio} from '../../services/audio';
import '../words/index.css';
import './index.css';
import {Icon} from '../../components/Icon';
import {collectWordCollectionIds,exportWordCollection} from '../../services/word-collection-export';
import {clearWordPdf,isFileCancel} from '../../services/files';
import '../../components/LibraryHeader.css';
import {Chevron} from '../../components/Chevron';
import {DateRangeCalendar} from '../../components/DateRangeCalendar';
import {useEffect,useRef,useState} from 'react';
import {View,Button,Picker,Text} from '@tarojs/components';
import Taro,{useDidShow,useDidHide,useRouter} from '@tarojs/taro';
import {api,storage,message} from '../../services/api';
import {refreshVisiblePages} from '../../services/visible-pages';
import '../calendar/index.css';
export default function Wrong(){
 const router=useRouter(),initial=router.params.date_from||router.params.date||'';
 const [range,setRange]=useState({start:initial,end:router.params.date_to||initial}),[calendarOpen,setCalendarOpen]=useState(false),[source,setSource]=useState(['review','monthly_quiz'].includes(router.params.source??'')?(router.params.source??''):''),[items,setItems]=useState<any[]>([]),[cursor,setCursor]=useState<string|null>(null),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false),[exporting,setExporting]=useState(false),[selectMode,setSelectMode]=useState<'review'|'list'|'copybook'|null>(null),[allIds,setAllIds]=useState<string[]|null>(null);const serial=useRef(0),loadedScope=useRef(''),menuSeq=useRef(0),reading=useRef(false),audio=useAudio();const context=()=>`${storage.get('access_token')}:${storage.get('child_id')}:${loadedScope.current}`;
 const sources=['全部来源','日常复习','月测'],values=['','review','monthly_quiz'];
 const load=async(d=range,s=source,after?:string,quiet=false)=>{
  if(reading.current)return;reading.current=true;
  const n=++serial.current,child=storage.get('child_id'),key=`${storage.get('access_token')}:${child}:${d.start}:${d.end}:${s}`,changed=loadedScope.current!==key,current=()=>n===serial.current&&key===`${storage.get('access_token')}:${storage.get('child_id')}:${d.start}:${d.end}:${s}`;
  if(!quiet||changed||!loaded)setBusy(true);if(!quiet||changed)setError('');
  if(changed){loadedScope.current=key;setLoaded(false);setItems([]);setCursor(null);setSelected([]);setAllIds(null);setSelectMode(null);}
  try{
   const read=(cursor?:string)=>{const query=[d.start&&d.end?`date_from=${d.start}&date_to=${d.end}`:'',s?`source=${s}`:'',cursor?`cursor=${encodeURIComponent(cursor)}`:'','limit=50'].filter(Boolean).join('&');return api(`/children/${child}/wrong-words?${query}`);};
   const data=after?await read(after):await refreshVisiblePages(read,changed?50:Math.max(50,items.length),current);
   if(!data||!current())return;
   setItems(old=>after?[...old,...data.items.filter((item:any)=>!old.some(previous=>previous.word.id===item.word.id))]:data.items);setCursor(data.next_cursor);setLoaded(true);setError('');
   if(!after)setSelected(old=>old.filter(id=>data.items.some((item:any)=>item.word.id===id&&!item.word.archived_at)));
  return true;}catch(e){if(!after&&current())setError(message(e));return false;}finally{if(n===serial.current){reading.current=false;setBusy(false);}}
 };
 useEffect(()=>()=>clearWordPdf(),[]);
 useDidShow(()=>{void load(range,source,undefined,true);});useDidHide(()=>{serial.current++;menuSeq.current++;reading.current=false;setBusy(false);setExporting(false);audio.stop();});
 const launch=(selection:any)=>{storage.set('review_source',selection);storage.set('study_intent','start');Taro.navigateTo({url:'/pages/review/index'});};
 const chosen=allIds?allIds.filter(id=>!selected.includes(id)):selected,count=chosen.length;
 const picked=(id:string)=>allIds?allIds.includes(id)&&!selected.includes(id):selected.includes(id);
 const leaveSelection=()=>{setSelectMode(null);setSelected([]);setAllIds(null);};
 const enterSelection=(mode:'review'|'list'|'copybook')=>{audio.stop();setSelectMode(mode);setSelected([]);setAllIds(null);};
 const open=(word:any)=>{if(exporting||word.archived_at)return;if(selectMode)setSelected(old=>old.includes(word.id)?old.filter(id=>id!==word.id):[...old,word.id]);else{audio.stop();void Taro.navigateTo({url:`/pages/word-detail/index?id=${encodeURIComponent(word.id)}`});}};
 const selectAll=async()=>{if(exporting||busy)return;if(allIds){setAllIds(null);setSelected([]);return;}const key=context(),n=++menuSeq.current,current=()=>n===menuSeq.current&&key===context();setExporting(true);setError('');try{const ids=await collectWordCollectionIds({kind:'mistakes',start:range.start,end:range.end,source},current);if(ids&&current()){setAllIds(ids);setSelected([]);}}catch(e){if(current())setError(message(e));}finally{if(current())setExporting(false);}};
 const exportPdf=async(format?:'copybook',ids?:string[])=>{if(exporting||busy)return;const key=context(),n=++menuSeq.current,current=()=>n===menuSeq.current&&key===context();setExporting(true);setError('');audio.stop();try{await exportWordCollection({kind:'mistakes',start:range.start,end:range.end,source,...(format?{format}:{}),...(ids?{ids}:{})},current);}catch(e){if(current()&&!isFileCancel(e))setError(message(e));}finally{if(current())setExporting(false);}};
 const menu=async()=>{if(busy||exporting)return;const key=context(),n=++menuSeq.current,current=()=>n===menuSeq.current&&key===context();try{const entries=['选择错词复习','导出当前范围 PDF','导出英文字帖','导出选中错词 PDF','导出选中英文字帖',...(range.start&&range.end?['复习这段时间的错词']:[])],r=await Taro.showActionSheet({itemList:entries});if(!current())return;if(r.tapIndex===0)enterSelection('review');else if(r.tapIndex===1||r.tapIndex===2)await exportPdf(r.tapIndex===2?'copybook':undefined);else if(r.tapIndex===3||r.tapIndex===4)enterSelection(r.tapIndex===4?'copybook':'list');else if(r.tapIndex===5)launch({source:'calendar',date_from:range.start,date_to:range.end,scope:'mistakes',...(source?{mistake_source:source}:{})});}catch(e){if(current()&&!isFileCancel(e))setError(message(e));}};
 const paging=useListPagination({key:context(),hasMore:!!cursor,count:items.length,ready:loaded&&!busy&&!error,blocked:busy||exporting||calendarOpen,refreshBlocked:!!selectMode,canLoad:()=>!reading.current,more:()=>load(range,source,cursor!,true),refresh:()=>load(range,source,undefined,true)});
 return <View className={`page history-page wordbook-page wrong-page ${selectMode?'wordbook-selecting':''}`}><View className='library-header'><View className='library-header-static'><Text className='library-header-title'>错题集</Text></View>{!selectMode&&<Button className='library-header-button' aria-label='更多错题操作' disabled={busy||exporting||!items.length} onClick={()=>void menu()}><Icon name='more' size='lg'/></Button>}</View><View className='row'><Button className='text-action' disabled={busy||exporting||!!selectMode} onClick={()=>setCalendarOpen(true)}>{range.start?(range.start===range.end?range.start:`${range.start} 至 ${range.end}`):'全部日期'}<Chevron direction='down'/></Button><Picker disabled={busy||exporting||!!selectMode} mode='selector' range={sources} value={values.indexOf(source)} onChange={e=>{const s=values[Number(e.detail.value)];setSource(s);void load(range,s);}}><View className='indicator-label'><Text>{sources[values.indexOf(source)]}</Text><Chevron direction='down'/></View></Picker></View>
 {error&&<View className='error'>{error}<Button className='text-action' disabled={busy||exporting} onClick={()=>load()}>重新加载</Button></View>}{busy&&!loaded&&<View className='muted'>正在读取错题…</View>}
 {selectMode&&<View className='muted small'>{allIds?'已选当前范围，点击单词可将其排除。':'点击单词勾选，可跨页选择。'}{selectMode==='review'?'单次最多复习 100 个错词。':'导出包含已选单词及其现有内容。'}</View>}
 <View className='wordbook-list'>{items.map((item,index)=>{const word=item.word,target={word_id:word.id,content_version:word.version},active=audio.active===JSON.stringify(target);return <View id={`wrong-${word.id}`} className={`wordbook-item ${word.archived_at?'wrong-removed':''}`} key={word.id} onClick={()=>open(word)}>{index>0&&<View className='library-divider'/>}<LibraryItemSummary title={word.lemma} status={word.archived_at?'已移出':'错词'} description={[word.part_of_speech,word.meaning_zh].filter(Boolean).join(' ')} selecting={!!selectMode} selected={picked(word.id)} audioLabel={`播放${word.lemma}发音`} audioActive={active} audioPlaying={active&&audio.status==='正在播放…'} audioDisabled={!!word.archived_at} onPronounce={()=>void audio.play(target)} onOpen={()=>open(word)}/><View className='muted small wrong-item-history'>{word.archived_at?'已移出 · ':''}错 {item.wrong_count} 次{item.unanswered_count?`（含未答 ${item.unanswered_count} 次）`:''} · {(item.sources??[]).map((s:string)=>s==='review'?'复习':'月测').join(' / ')} · 最近出错：{new Date(item.last_wrong_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}{item.correct_since_last_mistake?' · 之后已答对':''}</View></View>;})}</View>
 <AudioFeedback audio={audio}/>
 {loaded&&!items.length&&<View className='muted'>这个范围还没有错题。</View>}<ListLoadState {...paging}/>
 {items.length>0&&<View className='muted small'>答对后仍保留历史；未到期的词只练习，不改变复习计划。已移出的词不参与选择和导出。</View>}
 {selectMode&&<View className='wordbook-export-bar'><View className='wordbook-export-info'><Text className='wordbook-export-count'>已选 <Text>{count}</Text> 词</Text><Button className='wordbook-export-all' disabled={busy||exporting} onClick={()=>void selectAll()}>{allIds?'取消全选':'全选当前范围'}</Button></View><View className='wordbook-export-actions'><Button className='wordbook-export-cancel' disabled={exporting} onClick={leaveSelection}>取消</Button><Button className='wordbook-export-confirm' disabled={busy||exporting||!count||selectMode==='review'&&count>100} onClick={()=>selectMode==='review'?launch({source:'manual',word_ids:chosen}):void exportPdf(selectMode==='copybook'?'copybook':undefined,chosen)}>{exporting?'正在处理…':selectMode==='review'?'复习选中错词':selectMode==='copybook'?'导出英文字帖':'导出 PDF'}</Button></View>{selectMode==='review'&&count>100&&<View className='muted small'>单次最多复习 100 个，请减少选择。</View>}</View>}
 {calendarOpen&&<DateRangeCalendar value={range} mode='wrong' source={source} onClose={()=>setCalendarOpen(false)} onConfirm={value=>{setRange(value);setCalendarOpen(false);void load(value,source);}}/>}
 </View>;
}
