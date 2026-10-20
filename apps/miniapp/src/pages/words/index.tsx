import {splitVocabularyInput} from '../../utils/vocabulary-input';
import {useEffect,useRef,useState} from 'react';
import {View,Button,Input,Textarea,Picker} from '@tarojs/components';
import Taro,{useDidShow,useDidHide} from '@tarojs/taro';
import {api,storage,eventId,message} from '../../services/api';
const statusNames:Record<string,string>={queued:'等待生成',running:'正在生成',partial:'部分已保存',succeeded:'全部已保存',failed:'生成失败',cancelled:'任务已取消'};
export default function Words(){
 const child=storage.get('child_id'),pendingKey=`vocabulary-submit:${storage.get('access_token')}:${child}`;
 const [books,setBooks]=useState<any[]>([]),[book,setBook]=useState(0),[words,setWords]=useState<any[]>([]),[raw,setRaw]=useState(''),[theme,setTheme]=useState(''),[jobs,setJobs]=useState<any[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[visible,setVisible]=useState(true),[pending,setPending]=useState<any>(()=>storage.get(pendingKey)||null);
 const inFlight=useRef(false),polling=useRef(false);
 const run=async(fn:()=>Promise<any>)=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(message(e));}finally{inFlight.current=false;setBusy(false);}};
 const refresh=async()=>{const [b,w,j]=await Promise.all([api(`/children/${child}/wordbooks`),api(`/children/${child}/words`),api(`/children/${child}/ai-batches`)]);setBooks(b.items);setWords(w.items);setJobs(j.items);};
 useDidShow(()=>{setVisible(true);if(child)void run(refresh);});useDidHide(()=>setVisible(false));
 const active=jobs.some(j=>['queued','running'].includes(j.status));
 useEffect(()=>{if(!visible||!active)return;const timer=setInterval(async()=>{if(polling.current||inFlight.current)return;polling.current=true;try{await refresh();setError('');}catch(e){setError(message(e));}finally{polling.current=false;}},2000);return()=>clearInterval(timer);},[visible,active,child]);
 const submit=async(draft:any)=>{
  let job:any;try{job=await api(`/children/${child}/ai-batches`,'POST',draft.body,draft.key);}catch(e){if((e as any)?.status>=400&&(e as any)?.status<500){Taro.removeStorageSync(pendingKey);setPending(null);}throw e;}
  Taro.removeStorageSync(pendingKey);setPending(null);setRaw('');setJobs(old=>[job,...old.filter(x=>x.id!==job.id)]);setNotice('任务已提交，生成完成后自动保存并加入复习计划。可以离开页面，稍后回来查看。');await refresh();
 };
 return <View className='page'><View className='title'>我的单词本</View>{error&&<View className='error'>{error}<Button className='btn' disabled={busy} onClick={()=>run(refresh)}>刷新状态</Button></View>}{notice&&<View className='notice'>{notice}</View>}
 <View className='muted'>输入单词，AI 自动补充英美音标、中文释义和系列例句，无需逐词确认。</View>
 {pending&&<View className='card'><View>上次提交尚未确认。重试将使用同一任务请求，不重复保存。</View><Button className='btn primary' disabled={busy} onClick={()=>run(()=>submit(pending))}>重试上次提交</Button></View>}
 {!books.length?<Button className='btn' disabled={busy} onClick={()=>run(async()=>{await api(`/children/${child}/wordbooks`,'POST',{name:'我的单词本'},eventId());await refresh();})}>创建第一个单词本</Button>:<View className='card'>
 <Picker mode='selector' range={books.map(b=>b.name)} value={book} disabled={busy||!!pending} onChange={e=>setBook(Number(e.detail.value))}><View className='field field-picker'>{books[book]?.name??books[0]?.name} ▾</View></Picker>
 <Textarea className='field field-area' placeholder='输入单词，用换行、逗号、顿号或分号分隔（最多 30 个）' maxlength={3600} disabled={busy||!!pending} value={raw} onInput={e=>setRaw(e.detail.value)}/><Input className='field' placeholder='系列主题，如：机场出行（选填）' maxlength={80} disabled={busy||!!pending} value={theme} onInput={e=>setTheme(e.detail.value)}/>
 <View className='muted'>已识别 {splitVocabularyInput(raw).length} 个单词或短语</View>
 <Button disabled={busy||!!pending||active||!raw.trim()} className='btn primary' onClick={()=>run(async()=>{
  const list=splitVocabularyInput(raw);if(!list.length||list.length>30)throw Error('每批请输入 1～30 个单词。');if(new Set(list.map(x=>x.toLowerCase())).size!==list.length)throw Error('这一批有重复单词，请合并后再提交。');
  const draft={body:{wordbook_id:(books[book]??books[0]).id,words:list,theme},key:eventId()};storage.set(pendingKey,draft);setPending(draft);await submit(draft);
 })}>{active?'上一批正在生成…':'生成并加入词本'}</Button></View>}
 {jobs.length>0&&<View className='subtitle'>最近的生成任务</View>}{jobs.map(job=><View className='card' key={job.id}><View>{statusNames[job.status]??job.status} · 已保存 {job.items.filter((i:any)=>i.word_id).length} / {job.items.length} 词</View><View className='muted'>{job.items.map((i:any)=>i.input).join('、')}</View>{['queued','running'].includes(job.status)&&<View className='muted'>正在处理，离开页面不会取消任务。</View>}{job.items.filter((i:any)=>i.status==='invalid').map((i:any)=><View className='error' key={i.ordinal}>{i.input}：{i.reason||'未能生成可靠内容，请检查拼写。'}</View>)}{job.error_code&&<View className='error'>{message(Error(job.error_code))}</View>}{job.items.some((i:any)=>/[\r\n,，、;；]/.test(i.input))&&<><View className='notice'>旧任务把分隔符当成了词的一部分，请重新编辑提交。</View><Button className='btn' disabled={busy||!!pending||active} onClick={()=>{setRaw(job.items.filter((i:any)=>!i.word_id).map((i:any)=>i.input).join('\n'));setNotice('已恢复到上方输入框，请检查识别数量后重新提交。');}}>重新编辑输入</Button></>}{job.retryable&&!job.items.some((i:any)=>/[\r\n,，、;；]/.test(i.input))&&<Button className='btn' disabled={busy||active} onClick={()=>run(async()=>{const updated=await api(`/ai-batches/${job.id}/retry`,'POST',{},eventId());setJobs(old=>old.map(x=>x.id===updated.id?updated:x));await refresh();})}>只重试未保存的单词</Button>}{['partial','failed'].includes(job.status)&&!job.retryable&&<View className='muted'>本任务已达到 3 次尝试上限，已保存的词仍可正常复习。</View>}</View>)}
 <View className='subtitle'>孩子的全部单词（当前最多展示 200 个）</View>{words.map(w=><View className='card' key={w.id}><View className='word'>{w.lemma}</View><View>{w.part_of_speech} · {w.meaning_zh}</View>{(w.ipa_gb||w.ipa_us)&&<View className='muted'>英 {w.ipa_gb||'暂无'}　美 {w.ipa_us||'暂无'}</View>}{w.example&&<><View className='divider'/><View>{w.example.text_en}</View><View className='muted'>{w.example.translation_zh}</View></>}{w.dictionary_source?.startsWith('ai:')&&<View className='muted small'>AI 生成内容</View>}</View>)}
 </View>;
}
