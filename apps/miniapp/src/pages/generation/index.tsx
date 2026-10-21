import {useEffect,useRef,useState} from 'react';
import {View,Button} from '@tarojs/components';
import Taro,{useDidShow,useDidHide} from '@tarojs/taro';
import {api,storage,eventId,message} from '../../services/api';
const statusNames:Record<string,string>={queued:'等待生成',running:'正在生成',partial:'部分已保存',succeeded:'全部已保存',failed:'生成失败',cancelled:'任务已取消'};
export default function Generation(){
 const child=storage.get('child_id'),scope=`${storage.get('access_token')}:${child}`,editKey=`vocabulary-edit:${scope}`;
 const [jobs,setJobs]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[visible,setVisible]=useState(true);
 const inFlight=useRef(false),polling=useRef(false);
 const pending=storage.get(`vocabulary-submit:${scope}`);
 const run=async(fn:()=>Promise<any>)=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(message(e));}finally{inFlight.current=false;setBusy(false);}};
 const refresh=async()=>{const result=await api(`/children/${child}/ai-batches`);setJobs(result.items);setLoaded(true);};
 useDidShow(()=>{setVisible(true);if(child)void run(refresh);});useDidHide(()=>setVisible(false));
 const active=jobs.some(j=>['queued','running'].includes(j.status));
 useEffect(()=>{if(!visible||!active)return;const timer=setInterval(async()=>{if(polling.current||inFlight.current)return;polling.current=true;try{await refresh();setError('');}catch(e){setError(message(e));}finally{polling.current=false;}},2000);return()=>clearInterval(timer);},[visible,active,child]);
 return <View className='page'><View className='title'>生成记录</View><View className='muted'>显示当前孩子最近的 20 个任务。生成完成后自动保存，离开页面不会取消任务。</View>
 <Button className='text-action' disabled={busy||!child} onClick={()=>run(refresh)}>{busy?'正在刷新…':'刷新记录'}</Button>
 {error&&<View className='error'>{error}</View>}
 {!child&&<View className='notice'>请先选择孩子。</View>}
 {loaded&&!jobs.length&&<View className='card'>暂无生成记录，返回单词本添加第一批单词吧。</View>}
 {jobs.map(job=><View className='card' key={job.id}><View>{statusNames[job.status]??job.status} · {job.items.length?`已保存 ${job.items.filter((i:any)=>i.word_id).length} / ${job.items.length} 词`:'尚未识别词条'}</View><View className='muted'>{job.items.length?job.items.map((i:any)=>i.input).join('、'):job.raw_text?.slice(0,160)}</View>{job.items.filter((i:any)=>i.status==='invalid').map((i:any)=><View className='error' key={i.ordinal}>{i.input}：{i.reason||'未能生成可靠内容，请检查拼写。'}</View>)}{job.error_code&&<View className='error'>{message(Error(job.error_code))}</View>}{(job.status==='failed'&&job.attempts<job.max_attempts&&!job.items.some((i:any)=>i.word_id))&&<><Button className='btn' disabled={busy||!!pending||active} onClick={()=>run(async()=>{storage.set(editKey,{id:job.id,attempts:job.attempts,wordbook_id:job.wordbook_id,theme:job.theme,raw_text:job.raw_text||job.items.filter((i:any)=>!i.word_id).map((i:any)=>i.input).join('\n')});await Taro.navigateBack();})}>重新编辑输入</Button></>}{job.retryable&&!job.items.some((i:any)=>/[\r\n,，、;；]/.test(i.input))&&<Button className='btn' disabled={busy||active} onClick={()=>run(async()=>{const updated=await api(`/ai-batches/${job.id}/retry`,'POST',{},eventId());setJobs(old=>old.map(x=>x.id===updated.id?updated:x));await refresh();})}>只重试未保存的单词</Button>}{['partial','failed'].includes(job.status)&&job.attempts>=job.max_attempts&&<View className='muted'>本任务已达到 3 次尝试上限，已保存的词仍可正常复习。</View>}</View>)}
 </View>;
}
