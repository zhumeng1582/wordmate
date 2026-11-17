import {Chevron} from './Chevron';
import {useEffect,useRef,useState} from 'react';
import {View,Button,Picker,Input} from '@tarojs/components';
import {useDidShow} from '@tarojs/taro';
import {api,storage,eventId,message} from '../services/api';
export function LearningGoal({kind='words'}:{kind?:'words'|'hanzi'|'sentences'}){
 const [child]=useState(()=>storage.get('child_id'));
 const [data,setData]=useState<any>(null),[value,setValue]=useState(''),[custom,setCustom]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const lock=useRef(false),alive=useRef(true),serial=useRef(0),draft=useRef(false),presets=kind==='sentences'?[1,3,5,10]:[5,10,20,30],unit=kind==='sentences'?'句':'个';
 draft.current=!!data&&value!==String(data.daily_goal);
 const apply=(d:any)=>{setData(d);setValue(String(d.daily_goal));setCustom(!presets.includes(d.daily_goal));};
 const endpoint=`/children/${child}/${kind==='sentences'?'sentence-progress':kind==='hanzi'?'hanzi-progress':'learning-goal'}`;
 const load=async(preserveDraft=false)=>{const ticket=++serial.current,token=storage.get('access_token');setError('');try{const result=await api(endpoint);if(alive.current&&ticket===serial.current&&token===storage.get('access_token')&&child===storage.get('child_id')&&(!preserveDraft||!draft.current&&!lock.current))apply(result);}catch(e){if(alive.current&&ticket===serial.current)setError(message(e));}};
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;serial.current++;};},[child]);
 useDidShow(()=>{if(data&&!lock.current)void load(true);});
 const valid=/^\d+$/.test(value)&&Number(value)>=1&&Number(value)<=(kind==='sentences'?100:500);
 return <View>{error&&<View className='error'>{error}{!data&&<Button className='text-action' onClick={()=>void load()}>重试</Button>}</View>}{data?<>
 <View>{data.nickname} · 每日学习目标</View>
 <Picker mode='selector' disabled={busy} range={[...presets.map(n=>`${n} ${unit}`),'自定义']} value={custom?4:presets.indexOf(Number(value))} onChange={e=>{const i=Number(e.detail.value);setCustom(i===4);if(i<4)setValue(String(presets[i]));setSaved(false);}}><View className='field field-picker'>{custom?'自定义':`${value} ${unit} / 天`}<Chevron direction='down'/></View></Picker>
 {custom&&<Input className='field' type='number' maxlength={3} disabled={busy} value={value} placeholder={kind==='sentences'?'1–100 句 / 天':'1–500 个 / 天'} onInput={e=>{setValue(e.detail.value);setSaved(false);}}/>}
 <View className='muted small'>按孩子同步，家长共同使用。{kind==='sentences'?'学习、复习与巩固':kind==='hanzi'?'新学、复习和练习':'新学、复习和已提交测试中实际作答'}合计，重复学习同一{kind==='sentences'?'句':kind==='hanzi'?'个字':'个词'}只计一次。</View>
 {kind==='sentences'&&<View className='muted small'>查看句子和听音不计进度；点击“下一句”“完成本轮”或“还需巩固”时保存学习进度。</View>}
 <View className='muted small'>今天目标 {kind!=='words'?data.goal:data.today_goal} {unit}；修改从 {data.effective_from} 生效。</View>
 {value!==String(data.daily_goal)&&<Button className='btn primary' disabled={busy||!valid} onClick={async()=>{if(lock.current)return;lock.current=true;serial.current++;setBusy(true);setError('');try{apply(await api(endpoint,'PUT',{daily_goal:Number(value),expected_version:data.version},eventId()));setSaved(true);}catch(e){if(e instanceof Error&&e.message==='LEARNING_GOAL_CHANGED')await load();setError(message(e));}finally{lock.current=false;setBusy(false);}}}>{busy?'正在保存…':'保存目标'}</Button>}
 {saved&&<View className='muted small'>已保存</View>}
 </>:!error&&<View className='muted'>正在加载…</View>}</View>;
}
