import {useEffect,useRef,useState} from 'react';
import {View,Button,Text} from '@tarojs/components';
import {useDidShow,useDidHide} from '@tarojs/taro';
import {api,storage,go,message} from '../../services/api';
import {useAudio} from '../../services/audio';
import {AudioText,AudioFeedback} from '../../components/AudioControls';
import './index.css';
export default function Words(){
 const audio=useAudio(),serial=useRef(0);
 const [words,setWords]=useState<any[]>([]),[expanded,setExpanded]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[active,setActive]=useState(false),[visible,setVisible]=useState(true);
 const refresh=async()=>{const n=++serial.current;setBusy(true);try{const child=storage.get('child_id');const [data,jobs]=await Promise.all([api(`/children/${child}/words`),api(`/children/${child}/ai-batches`)]);if(n!==serial.current)return;setWords(data.items);setActive(jobs.items.some((j:any)=>['queued','running'].includes(j.status)));setLoaded(true);setError('');}catch(e){if(n===serial.current)setError(message(e));}finally{if(n===serial.current)setBusy(false);}};
 useDidShow(()=>{setVisible(true);void refresh();});useDidHide(()=>{setVisible(false);serial.current++;});
 useEffect(()=>{if(!visible||!active)return;const timer=setInterval(()=>{if(!busy)void refresh();},2000);return()=>clearInterval(timer);},[visible,active,busy]);
 const toggle=(id:string)=>{audio.stop();setExpanded(old=>old===id?'':id);};
 return <View className='page'><View className='wordbook-heading'><View className='title'>我的单词本</View><Button className='text-action' onClick={()=>go('add-words')}>＋ 添加单词</Button></View>
 {error&&<View className='error'>{error}<Button className='btn' disabled={busy} onClick={()=>refresh()}>重新加载</Button></View>}
 {busy&&!loaded&&<View className='muted'>正在加载…</View>}
 <View className='wordbook-status muted small'>{active?'新单词正在生成，完成后自动显示。':''}</View>
 <AudioFeedback audio={audio}/>
 {loaded&&!words.length&&!error&&<View className='muted'>还没有单词，点击右上角添加。</View>}
 {words.length>=200&&<View className='muted small'>当前展示前 200 个单词</View>}
 {!!words.length&&<View className='wordbook-list'>{words.map(w=><View className='wordbook-item' key={w.id} onClick={()=>toggle(w.id)}>
 <View className='wordbook-summary'><View className='wordbook-lemma'>{w.lemma}</View>
 <View className='wordbook-pronunciation' onClick={e=>e.stopPropagation()}><AudioText audio={audio} phonetic target={{word_id:w.id,content_version:w.version}} text={(audio.accent==='en-GB'?w.ipa_gb:w.ipa_us)||'听发音'}/></View>
 <Text className={`wordbook-chevron ${expanded===w.id?'is-open':''}`}>›</Text></View>
 {expanded===w.id&&<View className='wordbook-detail' onClick={e=>e.stopPropagation()}><View className='wordbook-meaning'><Text className='wordbook-pos'>{w.part_of_speech}</Text><Text>{w.meaning_zh}</Text></View>{w.example&&<View className='wordbook-example'><AudioText audio={audio} target={{sentence_id:w.example.id,content_version:w.example.content_version}} text={w.example.text_en}/><View className='wordbook-translation'>{w.example.translation_zh}</View></View>}</View>}
 </View>)}</View>}
 </View>;
}
