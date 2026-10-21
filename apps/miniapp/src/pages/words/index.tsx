import {shareCsv,isFileCancel} from '../../services/files';
import {useEffect,useRef,useState} from 'react';
import {View,Button,Text} from '@tarojs/components';
import {useDidShow,useDidHide} from '@tarojs/taro';
import {api,storage,go,message} from '../../services/api';
import {useAudio} from '../../services/audio';
import {AudioText,AudioFeedback} from '../../components/AudioControls';
import './index.css';
export default function Words(){
 const audio=useAudio(),serial=useRef(0),scope=useRef('');
 const [cursor,setCursor]=useState<string|null>(null),[total,setTotal]=useState(0),[selecting,setSelecting]=useState(false),[all,setAll]=useState(false),[selected,setSelected]=useState<string[]>([]),[exporting,setExporting]=useState(false);
 const count=all?total-selected.length:selected.length;
 const picked=(id:string)=>all?!selected.includes(id):selected.includes(id);
 const select=(id:string)=>setSelected(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);
 const [words,setWords]=useState<any[]>([]),[expanded,setExpanded]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[active,setActive]=useState(false),[visible,setVisible]=useState(true);
 const refresh=async(more=false)=>{const n=++serial.current;setBusy(true);try{const child=storage.get('child_id'),key=storage.get('access_token')+':'+child;if(scope.current!==key){scope.current=key;setWords([]);setSelected([]);setSelecting(false);setAll(false);setCursor(null);setLoaded(false);more=false;}const [data,jobs]=await Promise.all([api(`/children/${child}/words?limit=100${more&&cursor?'&cursor='+cursor:''}`),api(`/children/${child}/ai-batches`)]);if(n!==serial.current)return;setWords(old=>more?[...old,...data.items.filter((w:any)=>!old.some(x=>x.id===w.id))]:data.items);setCursor(data.next_cursor);setTotal(data.total);setActive(jobs.items.some((j:any)=>['queued','running'].includes(j.status)));setLoaded(true);setError('');}catch(e){if(n===serial.current)setError(message(e));}finally{if(n===serial.current)setBusy(false);}};
 useDidShow(()=>{setVisible(true);void refresh();});useDidHide(()=>{setVisible(false);serial.current++;});
 useEffect(()=>{if(!visible||!active||selecting)return;const timer=setInterval(()=>{if(!busy)void refresh();},2000);return()=>clearInterval(timer);},[visible,active,busy,selecting]);
 const toggle=(id:string)=>{if(selecting){select(id);return;}audio.stop();setExpanded(old=>old===id?'':id);};
 const exportSelection=async()=>{if(exporting||!count)return;setExporting(true);setError('');try{const result=await api(`/children/${storage.get('child_id')}/word-exports`,'POST',all?{all:true,excluded_ids:selected}:{word_ids:selected});await shareCsv(result.content);}catch(e){if(!isFileCancel(e))setError(message(e));}finally{setExporting(false);}};
 return <View className='page'><View className='wordbook-heading'><View className='title'>我的单词本</View><Button className='text-action' onClick={()=>go('add-words')}>＋ 添加单词</Button></View>
 {error&&<View className='error'>{error}<Button className='btn' disabled={busy} onClick={()=>refresh()}>重新加载</Button></View>}
 {busy&&!loaded&&<View className='muted'>正在加载…</View>}
 <View className='wordbook-status muted small'>{active?'新单词正在生成，完成后自动显示。':''}</View>
 <AudioFeedback audio={audio}/>
 {loaded&&!words.length&&!error&&<View className='muted'>还没有单词，点击右上角添加。</View>}
 {!!total&&<View className='export-toolbar'>{selecting?<><Button className='text-action' disabled={exporting} onClick={()=>{setAll(!all);setSelected([]);}}>{all?'取消全选':'全选全部单词'}</Button><Button className='text-action' disabled={exporting} onClick={()=>{setSelecting(false);setSelected([]);setAll(false);}}>取消</Button><Button className='btn primary' disabled={exporting||count<=0} onClick={exportSelection}>{exporting?'正在导出…':`导出 ${count} 词`}</Button></>:<><Text className='muted small'>共 {total} 词</Text><Button className='text-action' onClick={()=>{audio.stop();setExpanded('');setSelecting(true);}}>选择导出</Button></>}</View>}
 {selecting&&<View className='muted small'>点击单词勾选，可跨页选择；全选包含尚未加载的单词。导出为 Excel 可打开的 CSV 文件。</View>}
 {!!words.length&&<View className='wordbook-list'>{words.map(w=><View className='wordbook-item' key={w.id} onClick={()=>!exporting&&toggle(w.id)}>
 <View className='wordbook-summary'>{selecting&&<Text className={`word-select ${picked(w.id)?'checked':''}`}>{picked(w.id)?'✓':'○'}</Text>}<View className='wordbook-lemma'>{w.lemma}</View>
 {!selecting&&<View className='wordbook-pronunciation' onClick={e=>e.stopPropagation()}><AudioText audio={audio} phonetic target={{word_id:w.id,content_version:w.version}} text={(audio.accent==='en-GB'?w.ipa_gb:w.ipa_us)||'听发音'}/></View>}
 {!selecting&&<Text className={`wordbook-chevron ${expanded===w.id?'is-open':''}`}>›</Text>}</View>
 {!selecting&&expanded===w.id&&<View className='wordbook-detail' onClick={e=>e.stopPropagation()}><View className='wordbook-meaning'><Text className='wordbook-pos'>{w.part_of_speech}</Text><Text>{w.meaning_zh}</Text></View>{w.example&&<View className='wordbook-example'><AudioText audio={audio} target={{sentence_id:w.example.id,content_version:w.example.content_version}} text={w.example.text_en}/><View className='wordbook-translation'>{w.example.translation_zh}</View></View>}</View>}
 </View>)}</View>}
 {cursor&&<Button className='btn secondary' disabled={busy||exporting} onClick={()=>refresh(true)}>{busy?'正在加载…':'加载更多'}</Button>}
 </View>;
}
