import {useRef,useState} from 'react';
import {useDidShow,useDidHide} from '@tarojs/taro';
import {View,Text,Button} from '@tarojs/components';
import {api,storage,go,message} from '../../services/api';
export default function Home(){
  const [today,setToday]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const serial=useRef(0);
  const refresh=async()=>{const n=++serial.current,id=storage.get('child_id');setToday(null);setError('');if(!id||!storage.get('access_token')){setLoading(false);return;}setLoading(true);try{const data=await api(`/children/${id}/today`);if(n===serial.current)setToday(data);}catch(e){if(n===serial.current)setError(message(e));}finally{if(n===serial.current)setLoading(false);}};
  useDidShow(()=>{void refresh();});useDidHide(()=>{serial.current++;});
  return <View className='page'><View className='home-toolbar'><View className='subtitle'>每天一点，记得更牢</View><Button className='home-settings' onClick={()=>go('settings')}>设置 ›</Button></View><View className='title'>今天一起学单词</View>
    {error&&<View className='error'>{error}<Button className='btn' onClick={()=>refresh()}>重新加载</Button></View>}
    {!error&&<View className='card'>{loading?<View className='muted'>正在加载学习进度…</View>:today?<><Text>{today.child.nickname} · 今日学习</Text><View className='progress'>{today.completed_words} / {today.goal}</View><View className='muted'>待复习 {today.due_count} 张 · 还可新学 {today.remaining_new_limit} 词</View><View className='muted'>{today.checked_in?'今日已打卡':'完成每日目标自动打卡'} · 连续 {today.streak_days} 天</View><Button className='btn primary' onClick={()=>{storage.set('review_source',{source:'scheduled'});go('review');}}>开始复习</Button></>:<><View>先登录并选择孩子，建立独立的学习记录。</View><Button className='btn primary' onClick={()=>go('family')}>设置家庭与孩子</Button></>}</View>}
  </View>;
}
