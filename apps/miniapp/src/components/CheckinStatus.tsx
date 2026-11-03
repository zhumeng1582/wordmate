import {useEffect,useRef,useState} from 'react';
import {View,Text,Button,Picker} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {api,storage,eventId,message} from '../services/api';
export function CheckinStatus({today,onShare,onChanged}:{today:any;onShare:()=>void;onChanged:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const locked=useRef(false),alive=useRef(true);
 const context=`${storage.get('access_token')}:${storage.get('child_id')}`,current=()=>alive.current&&context===`${storage.get('access_token')}:${storage.get('child_id')}`;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const date=today.date||new Date(Date.now()+8*3600000).toISOString().slice(0,10),yesterday=new Date(Date.parse(`${date}T00:00:00Z`)-86400000).toISOString().slice(0,10);
 const makeup=async(date:string)=>{
  if(locked.current||!current()||!today.makeup_credits)return;locked.current=true;
  try{
   const confirm=await Taro.showModal({title:'补卡',content:`使用 1 次补卡机会补上 ${date}？`,confirmText:'确认补卡'});if(!confirm.confirm||!current())return;
   setBusy(true);setError('');await api(`/children/${storage.get('child_id')}/checkin-makeup`,'POST',{date},eventId());if(current()){onChanged();Taro.showToast({title:'补卡成功',icon:'success'});}
  }catch(e){if(current())setError(message(e));}finally{locked.current=false;if(current())setBusy(false);}
 };
 return <View className='home-checkin'>
  <View className='home-checkin-row'><View><Text>{today.checked_in?'✓ 今日已打卡':'今日未打卡'}</Text>{today.streak_days>0&&<Text className='home-checkin-streak'>连续 {today.streak_days} 天</Text>}</View>
   {today.completed_words>0&&<Button className='text-action' onClick={onShare}>{today.checked_in?'分享打卡':'分享进度'}</Button>}
  </View>
  {today.makeup_credits>0&&<Picker mode='date' value={yesterday} start='2000-01-01' end={yesterday} disabled={busy} onChange={event=>void makeup(event.detail.value)}><View className='home-makeup'>{busy?'正在补卡…':`补卡 · 可用 ${today.makeup_credits} 次`}</View></Picker>}
  {error&&<View className='error'>{error}</View>}
 </View>;
}
