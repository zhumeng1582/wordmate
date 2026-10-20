import {useState} from 'react';
import Taro,{useDidShow} from '@tarojs/taro';
import {View,Text,Button} from '@tarojs/components';
import {api,storage,go,message} from '../../services/api';
export default function Home(){
  const [today,setToday]=useState<any>(null),[error,setError]=useState('');
  useDidShow(()=>{const id=storage.get('child_id');setToday(null);setError('');if(id&&storage.get('access_token'))api(`/children/${id}/today`).then(setToday).catch(e=>setError(message(e)));});
  return <View className='page'>{DEV_AUTH&&<View className='notice'>开发环境：使用测试身份与有限词库，学习数据与正式环境分开。</View>}<View className='subtitle'>每天一点，记得更牢</View><View className='title'>今天一起学单词</View>
    {error&&<View className='error'>{error}</View>}
    <View className='card'>{today?<><Text>{today.child.nickname} · 今日学习</Text><View className='progress'>{today.completed_words} / {today.goal}</View><View className='muted'>待复习 {today.due_count} 张 · 还可新学 {today.remaining_new_limit} 词</View><Button className='btn primary' onClick={()=>go('review')}>开始复习</Button></>:<><View>先登录并选择孩子，建立独立的学习记录。</View><Button className='btn primary' onClick={()=>go('family')}>设置家庭与孩子</Button></>}</View>
    <Button className='btn' disabled={!today} onClick={()=>go('words')}>单词本 · 添加单词</Button><Button className='btn' onClick={()=>go('family')}>家庭与孩子</Button>
    <Button className='btn' disabled={!today} onClick={()=>go('quiz')}>按月测验 · 抽样 / 全量</Button>
    <View className='muted small'>0.1 开发中 · 当前已接入录词与复习主流程。月测已接入测试题源，日历、分享等功能继续开发。</View>
  </View>;
}
