import {useState} from 'react';
import {View,Button,Input,Textarea,Picker} from '@tarojs/components';
import {useDidShow} from '@tarojs/taro';
import {api,storage,eventId,message} from '../../services/api';
export default function Words(){
  const child=storage.get('child_id'),[books,setBooks]=useState<any[]>([]),[book,setBook]=useState(0),[words,setWords]=useState<any[]>([]),[raw,setRaw]=useState(''),[theme,setTheme]=useState(''),[batch,setBatch]=useState<any>(null),[choices,setChoices]=useState<Record<string,number>>({}),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const run=async(fn:()=>Promise<any>)=>{if(busy)return;setBusy(true);setError('');try{await fn();}catch(e){setError(message(e));}finally{setBusy(false);}};
  const refresh=async()=>{setBooks((await api(`/children/${child}/wordbooks`)).items);setWords((await api(`/children/${child}/words`)).items);};
  useDidShow(()=>{if(child)void run(refresh);});
  return <View className='page'><View className='title'>我的单词本</View>{error&&<View className='error'>{error}</View>}{notice&&<View className='notice'>{notice}</View>}{DEV_AUTH&&<View className='notice'>测试词库：apple、airport、luggage、delay、book、read、cat、dog、school、travel。未知词不会编造释义。</View>}
    {!books.length?<Button disabled={busy} onClick={()=>run(async()=>{await api(`/children/${child}/wordbooks`,'POST',{name:'我的单词本'},eventId());await refresh();})}>创建第一个单词本</Button>:<View className='card'>
    <Picker mode='selector' range={books.map(b=>b.name)} value={book} onChange={e=>setBook(Number(e.detail.value))}><View className='field'>{books[book]?.name} ▾</View></Picker>
    <Textarea className='field' placeholder='输入单词，一行一个或用逗号分隔（最多 30 个）' maxlength={3600} value={raw} onInput={e=>setRaw(e.detail.value)}/><Input className='field' placeholder='系列主题，如：机场出行（选填）' maxlength={80} value={theme} onInput={e=>setTheme(e.detail.value)}/>
    <Button disabled={busy||!raw.trim()} className='primary' onClick={()=>run(async()=>{const b=await api(`/children/${child}/batches`,'POST',{wordbook_id:books[book].id,words:raw.split(/[\n,，]+/).map(x=>x.trim()).filter(Boolean),theme},eventId());setBatch(b);setChoices(Object.fromEntries(b.items.map((i:any)=>[i.id,0])));setNotice('');})}>查询并确认词义</Button>
    </View>}
    {batch&&<View className='card'><View>确认后加入学习计划</View>{batch.items.map((i:any)=><View key={i.id}><View>{i.raw_text}</View>{i.candidates.length?<Picker mode='selector' range={[...i.candidates.map((c:any)=>`${c.part_of_speech} · ${c.meaning_zh}`),'跳过']} value={choices[i.id]??0} onChange={e=>setChoices({...choices,[i.id]:Number(e.detail.value)})}><View className='field'>{i.candidates[choices[i.id]]?.meaning_zh??'跳过'} ▾</View></Picker>:<View className='muted'>未找到可确认词义，将跳过。</View>}</View>)}<Button disabled={busy} className='primary' onClick={()=>run(async()=>{await api(`/batches/${batch.id}/confirm`,'POST',{expected_version:batch.version,selections:batch.items.map((i:any)=>{const c=i.candidates[choices[i.id]];return {item_id:i.id,action:c?'select':'skip',...(c?{candidate_id:c.candidate_id}:{})};})},eventId());setBatch(null);setRaw('');setNotice('单词已保存。例句生成任务已入队；生成服务尚未启用。');await refresh();})}>确认保存</Button></View>}
    <View className='subtitle'>孩子的全部单词（当前最多展示 200 个）</View>{words.map(w=><View className='card' key={w.id}><View className='word'>{w.lemma}</View><View>{w.part_of_speech} · {w.meaning_zh}</View></View>)}
  </View>;
}
