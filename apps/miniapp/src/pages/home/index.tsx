import {useState} from 'react';
import Taro,{useDidShow} from '@tarojs/taro';
import {View,Text,Button} from '@tarojs/components';
import {api,storage,go,message} from '../../services/api';
export default function Home(){
  const [today,setToday]=useState<any>(null),[error,setError]=useState('');
  useDidShow(()=>{const id=storage.get('child_id');setToday(null);setError('');if(id&&storage.get('access_token'))api(`/children/${id}/today`).then(setToday).catch(e=>setError(message(e)));});
  return <View className='page'>{DEV_AUTH&&<View className='notice'>开发环境：使用测试登录身份，学习数据与正式环境分开；AI 生成会使用真实服务额度。</View>}<View className='home-toolbar'><View className='subtitle'>每天一点，记得更牢</View><Button className='home-settings' onClick={()=>go('settings')}>设置 ›</Button></View><View className='title'>今天一起学单词</View>
    {error&&<View className='error'>{error}</View>}
    <View className='card'>{today?<><Text>{today.child.nickname} · 今日学习</Text><View className='progress'>{today.completed_words} / {today.goal}</View><View className='muted'>待复习 {today.due_count} 张 · 还可新学 {today.remaining_new_limit} 词</View><View className='muted'>{today.checked_in?'今日已打卡':'完成每日目标自动打卡'} · 连续 {today.streak_days} 天</View><Button className='btn primary' onClick={()=>{storage.set('review_source',{source:'scheduled'});go('review');}}>开始复习</Button></>:<><View>先登录并选择孩子，建立独立的学习记录。</View><Button className='btn primary' onClick={()=>go('family')}>设置家庭与孩子</Button></>}</View>
  </View>;
}
