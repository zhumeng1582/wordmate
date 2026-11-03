import {Chevron} from './Chevron';
import {useEffect,useRef,useState} from 'react';
import {View,Button,Picker,Input} from '@tarojs/components';
import {useDidShow} from '@tarojs/taro';
import {api,storage,eventId,message} from '../services/api';
export function LearningGoal(){
 const [child]=useState(()=>storage.get('child_id'));
 const [data,setData]=useState<any>(null),[value,setValue]=useState(''),[custom,setCustom]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const lock=useRef(false),alive=useRef(true),serial=useRef(0),draft=useRef(false),presets=[5,10,20,30];
 draft.current=!!data&&value!==String(data.daily_goal);
 const apply=(d:any)=>{setData(d);setValue(String(d.daily_goal));setCustom(!presets.includes(d.daily_goal));};
 const load=async(preserveDraft=false)=>{const ticket=++serial.current,token=storage.get('access_token');setError('');try{const result=await api(`/children/${child}/learning-goal`);if(alive.current&&ticket===serial.current&&token===storage.get('access_token')&&child===storage.get('child_id')&&(!preserveDraft||!draft.current&&!lock.current))apply(result);}catch(e){if(alive.current&&ticket===serial.current)setError(message(e));}};
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;serial.current++;};},[child]);
 useDidShow(()=>{if(data&&!lock.current)void load(true);});
 const valid=/^\d+$/.test(value)&&Number(value)>=1&&Number(value)<=500;
 return <View>{error&&<View className='error'>{error}{!data&&<Button className='text-action' onClick={()=>void load()}>重试</Button>}</View>}{data?<>
 <View>{data.nickname} · 每日学习目标</View>
 <Picker mode='selector' disabled={busy} range={['5 个','10 个','20 个','30 个','自定义']} value={custom?4:presets.indexOf(Number(value))} onChange={e=>{const i=Number(e.detail.value);setCustom(i===4);if(i<4)setValue(String(presets[i]));setSaved(false);}}><View className='field field-picker'>{custom?'自定义':`${value} 个 / 天`}<Chevron direction='down'/></View></Picker>
 {custom&&<Input className='field' type='number' maxlength={3} disabled={busy} value={value} placeholder='1–500 个 / 天' onInput={e=>{setValue(e.detail.value);setSaved(false);}}/>}
 <View className='muted small'>按孩子同步，家长共同使用。新学和复习合计，重复学习同一个词只计一次。</View>
 <View className='muted small'>今天目标 {data.today_goal} 个；修改从 {data.effective_from} 生效。</View>
 {value!==String(data.daily_goal)&&<Button className='btn primary' disabled={busy||!valid} onClick={async()=>{if(lock.current)return;lock.current=true;serial.current++;setBusy(true);setError('');try{apply(await api(`/children/${child}/learning-goal`,'PUT',{daily_goal:Number(value),expected_version:data.version},eventId()));setSaved(true);}catch(e){if(e instanceof Error&&e.message==='LEARNING_GOAL_CHANGED')await load();setError(message(e));}finally{lock.current=false;setBusy(false);}}}>{busy?'正在保存…':'保存目标'}</Button>}
 {saved&&<View className='muted small'>已保存</View>}
 </>:!error&&<View className='muted'>正在加载…</View>}</View>;
}
