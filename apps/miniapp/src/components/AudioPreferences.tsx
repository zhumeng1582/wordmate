import {AudioIcon} from './AudioControls';
import {useAudio} from '../services/audio';
import {useEffect,useState} from 'react';
import {View,Button,Picker,Switch} from '@tarojs/components';
import {api,eventId,message} from '../services/api';
export function AudioPreferences(){
 const audio=useAudio();
 const [original,setOriginal]=useState<any>(null),[settings,setSettings]=useState<any>(null),[voices,setVoices]=useState<any[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{let alive=true;Promise.all([api('/me/audio-settings'),api('/voices')]).then(([s,v])=>{if(alive){setSettings(s);setOriginal(s);setVoices(v.items);}}).catch(e=>{if(alive)setError(message(e));});return()=>{alive=false;};},[]);
 const available=voices.filter(v=>v.accent===settings?.accent);
 const dirty=!!settings&&!!original&&(settings.accent!==original.accent||settings.voice_id!==original.voice_id||!!settings.auto_play!==!!original.auto_play);
 const label=(v:any)=>v.gender==='Male'?'男声':v.gender==='Female'?'女声':v.id;
 return <View><View className='muted'>用于所有学习页面，随当前账号同步。</View>
 {error&&<View className='error'>{error}</View>}
 {settings?<><View className='form-label'>发音口音</View><Picker disabled={busy} mode='selector' range={['英音','美音']} value={settings.accent==='en-US'?1:0} onChange={e=>{audio.stop();const accent=Number(e.detail.value)?'en-US':'en-GB';setSettings({...settings,accent,voice_id:voices.find(v=>v.accent===accent)?.id??null});setSaved(false);}}><View className='field field-picker'>{settings.accent==='en-US'?'美音':'英音'} ▾</View></Picker>
 <View className='form-label'>音色</View>{available.length>1?<Picker disabled={busy||!available.length} mode='selector' range={available.map(label)} value={Math.max(0,available.findIndex(v=>v.id===settings.voice_id))} onChange={e=>{audio.stop();setSettings({...settings,voice_id:available[Number(e.detail.value)].id});setSaved(false);}}><View className='field field-picker'>{available.find(v=>v.id===settings.voice_id)?label(available.find(v=>v.id===settings.voice_id)):'暂无可用音色'} ▾</View></Picker>:<View className='muted'>{available.find(v=>v.id===settings.voice_id)?label(available.find(v=>v.id===settings.voice_id)):'暂无可用音色'}</View>}
 <Button className='text-action' disabled={busy||!!audio.active||!available.some(v=>v.id===settings.voice_id)} onClick={()=>audio.play({preview:true,accent:settings.accent,voice_id:settings.voice_id})}><AudioIcon active={!!audio.active} playing={audio.status==='正在播放…'}/>试听当前音色</Button>
 {audio.error&&<View className='error'>{audio.error}</View>}
 <View className='autoplay-setting'><View>自动播放单词发音<View className='muted small'>复习切换单词时自动播放</View></View><Switch checked={!!settings.auto_play} disabled={busy} onChange={e=>{setSettings({...settings,auto_play:e.detail.value});setSaved(false);}}/></View>
 {dirty&&<Button className='btn primary' disabled={busy||!available.some(v=>v.id===settings.voice_id)} onClick={async()=>{if(busy)return;setBusy(true);setError('');setSaved(false);try{const updated=await api('/me/audio-settings','PUT',{accent:settings.accent,voice_id:settings.voice_id,auto_play:!!settings.auto_play,expected_version:settings.version},eventId());setSettings(updated);setOriginal(updated);setSaved(true);}catch(e){setError(message(e));if(e instanceof Error&&e.message==='AUDIO_SETTINGS_CHANGED'){try{const updated=await api('/me/audio-settings');setSettings(updated);setOriginal(updated);}catch(refreshError){setError(message(refreshError));}}}finally{setBusy(false);}}}>{busy?'正在保存…':'保存设置'}</Button>}{saved&&<View className='muted'>已同步到账号</View>}</>:!error&&<View className='muted'>正在加载设置…</View>}
 </View>;
}
