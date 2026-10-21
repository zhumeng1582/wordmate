import {useAudio} from '../../services/audio';
import {AudioText,AudioFeedback} from '../../components/AudioControls';
import {useEffect,useRef,useState} from 'react';
import {View,Button,Input,Textarea,Picker} from '@tarojs/components';
import Taro,{useDidShow,useDidHide} from '@tarojs/taro';
import {api,storage,eventId,message} from '../../services/api';
export default function Words(){
 const audio=useAudio();
 const child=storage.get('child_id'),pendingKey=`vocabulary-submit:${storage.get('access_token')}:${child}`,editKey=`vocabulary-edit:${storage.get('access_token')}:${child}`;
 const [books,setBooks]=useState<any[]>([]),[book,setBook]=useState(0),[words,setWords]=useState<any[]>([]),[raw,setRaw]=useState(''),[theme,setTheme]=useState(''),[jobs,setJobs]=useState<any[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[visible,setVisible]=useState(true),[pending,setPending]=useState<any>(()=>storage.get(pendingKey)||null);
 const [editing,setEditing]=useState<any>(null);
 const inFlight=useRef(false),polling=useRef(false);
 const run=async(fn:()=>Promise<any>)=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(message(e));}finally{inFlight.current=false;setBusy(false);}};
 const refresh=async()=>{const [b,w,j]=await Promise.all([api(`/children/${child}/wordbooks`),api(`/children/${child}/words`),api(`/children/${child}/ai-batches`)]);setBooks(b.items);setWords(w.items);setJobs(j.items);};
 useDidShow(()=>{setVisible(true);if(child)void run(async()=>{
  await refresh();
  const edit=storage.get(editKey);
  if(edit&&!pending){
   Taro.removeStorageSync(editKey);
   if(raw.trim()&&raw!==edit.raw_text){const result=await Taro.showModal({title:'替换当前输入？',content:'当前有尚未提交的内容，重新编辑任务会替换这些内容。'});if(!result.confirm)return;}
   setEditing(edit);setTheme(edit.theme??'');setRaw(edit.raw_text);const available=await api(`/children/${child}/wordbooks`);setBooks(available.items);setBook(Math.max(0,available.items.findIndex((b:any)=>b.id===edit.wordbook_id)));setNotice('正在编辑原任务，提交后覆盖原记录并清除旧错误。');
  }
 });});useDidHide(()=>setVisible(false));
 const active=jobs.some(j=>['queued','running'].includes(j.status));
 useEffect(()=>{if(!visible||!active)return;const timer=setInterval(async()=>{if(polling.current||inFlight.current)return;polling.current=true;try{await refresh();setError('');}catch(e){setError(message(e));}finally{polling.current=false;}},2000);return()=>clearInterval(timer);},[visible,active,child]);
 const submit=async(draft:any)=>{
  let job:any;try{job=await api(draft.jobId?`/ai-batches/${draft.jobId}`:`/children/${child}/ai-batches`,draft.jobId?'PUT':'POST',draft.body,draft.key);}catch(e){if((e as any)?.status>=400&&(e as any)?.status<500){Taro.removeStorageSync(pendingKey);setPending(null);}throw e;}
  Taro.removeStorageSync(pendingKey);setPending(null);setEditing(null);setRaw('');setJobs(old=>[job,...old.filter(x=>x.id!==job.id)]);setNotice('已提交，完成后自动加入词本和复习计划。');await refresh();
 };
 return <View className='page'><View className='title'>我的单词本</View>{error&&<View className='error'>{error}<Button className='btn' disabled={busy} onClick={()=>run(refresh)}>刷新状态</Button></View>}{notice&&<View className='notice'>{notice}</View>}
 <View className='muted'>粘贴整段文本，AI 识别其中的单词或短语，自动补充音标、释义和例句。请勿粘贴密码、密钥或个人敏感资料。</View>
 {editing&&!pending&&<Button className='btn' disabled={busy} onClick={()=>{setEditing(null);setRaw('');setNotice('已取消编辑，原任务未修改。');}}>取消编辑原任务</Button>}
 {pending&&<View className='card'><View>上次提交尚未确认。重试将使用同一任务请求，不重复保存。</View><Button className='btn primary' disabled={busy} onClick={()=>run(()=>submit(pending))}>重试上次提交</Button></View>}
 {!books.length?<Button className='btn' disabled={busy} onClick={()=>run(async()=>{await api(`/children/${child}/wordbooks`,'POST',{name:'我的单词本'},eventId());await refresh();})}>创建第一个单词本</Button>:<View className='card'>
 {books.length>1&&<Picker mode='selector' range={books.map(b=>b.name)} value={book} disabled={busy||!!pending} onChange={e=>setBook(Number(e.detail.value))}><View className='field field-picker'>{books[book]?.name??books[0]?.name} ▾</View></Picker>}
 <Textarea className='field field-area' placeholder='粘贴单词列表、编号或表格文本，AI 自动识别（单次最多 30 项）' maxlength={8000} disabled={busy||!!pending} value={raw} onInput={e=>setRaw(e.detail.value)}/><Input className='field' placeholder='系列主题，如：机场出行（选填）' maxlength={80} disabled={busy||!!pending} value={theme} onInput={e=>setTheme(e.detail.value)}/>
 <View className='muted'>{raw.length} / 8000 字符</View>
 <Button disabled={busy||!!pending||active||!raw.trim()} className='btn primary' onClick={()=>run(async()=>{
  const draft={jobId:editing?.id,body:{...(editing?{expected_attempts:editing.attempts}:{}),wordbook_id:(books[book]??books[0]).id,source_type:'text',raw_text:raw,theme},key:eventId()};storage.set(pendingKey,draft);setPending(draft);await submit(draft);
 })}>{active?'上一批正在生成…':editing?'更新原任务并生成':'生成并加入词本'}</Button></View>}
 <Button className='text-action' onClick={()=>Taro.navigateTo({url:'/pages/generation/index'})}>生成记录 ›</Button>
 <AudioFeedback audio={audio}/><View className='subtitle'>全部单词</View>{words.length>=200&&<View className='muted small'>当前展示前 200 个单词</View>}{words.map(w=><View className='card' key={w.id}><View className='word'>{w.lemma}</View><AudioText audio={audio} phonetic target={{word_id:w.id,content_version:w.version}} text={(audio.accent==='en-GB'?w.ipa_gb:w.ipa_us)||'听发音'}/><View>{w.part_of_speech} · {w.meaning_zh}</View>{w.example&&<><View className='divider'/><AudioText audio={audio} target={{sentence_id:w.example.id,content_version:w.example.content_version}} text={w.example.text_en}/><View className='muted'>{w.example.translation_zh}</View></>}</View>)}
 </View>;
}
