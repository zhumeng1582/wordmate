import {useState} from 'react';
import {View,Text,Button} from '@tarojs/components';
import {useDidShow} from '@tarojs/taro';
import {go,storage} from '../../services/api';
import {AudioPreferences} from '../../components/AudioPreferences';
import './index.css';
const entries=[
 {page:'words',title:'单词本 · 添加单词',description:'录入、查看和学习单词',needsChild:true},
 {page:'family',title:'家庭与孩子',description:'账号、孩子档案与家庭邀请',needsChild:false},
 {page:'quiz',title:'按月测验',description:'抽样测试或全量测试',needsChild:true},
 {page:'calendar',title:'学习日历',description:'打卡记录与按日复习',needsChild:true},
 {page:'wrong',title:'历史错题集',description:'回顾答错的单词',needsChild:true}
];
export default function Settings(){
 const [signedIn,setSignedIn]=useState(false),[hasChild,setHasChild]=useState(false),[account,setAccount]=useState(''),[visit,setVisit]=useState(0);
 useDidShow(()=>{const token=storage.get('access_token');setSignedIn(!!token);setAccount(token||'');setVisit(v=>v+1);setHasChild(!!token&&!!storage.get('child_id'));});
 return <View className='page settings-page'><View className='title'>设置</View>
 <View className='subtitle'>学习管理</View>
 {!hasChild&&<View className='muted settings-hint'>请先在“家庭与孩子”登录并选择孩子。</View>}
 <View className='card settings-menu'>{entries.map(item=><Button key={item.page} className='settings-entry' disabled={item.needsChild&&!hasChild} onClick={()=>go(item.page)}>
  <View className='settings-entry-copy'><View className='settings-entry-title'>{item.title}</View><View className='muted small'>{item.description}</View></View><Text className='settings-chevron'>›</Text>
 </Button>)}</View>
 <View className='subtitle'>发音设置</View><View className='card'>{signedIn?<AudioPreferences key={account+':'+visit}/>:<><View className='muted'>登录后可保存口音和音色，并同步到同一账号的其他设备。</View><Button className='btn' onClick={()=>go('family')}>前往登录</Button></>}</View>
 <View className='subtitle'>外观</View><View className='card'><View>跟随微信</View><View className='muted'>自动使用浅色或深色主题，无需手动切换。</View></View>
 </View>;
}
