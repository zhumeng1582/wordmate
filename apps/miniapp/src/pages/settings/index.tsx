import {useState} from 'react';
import {View,Text,Button} from '@tarojs/components';
import {useDidShow} from '@tarojs/taro';
import {go,storage} from '../../services/api';
import {AudioPreferences} from '../../components/AudioPreferences';
import './index.css';
const entries=[
 {page:'words',title:'单词本 · 添加单词',needsChild:true},
 {page:'family',title:'家庭与孩子',needsChild:false},
 {page:'quiz',title:'按月测验',needsChild:true},
 {page:'calendar',title:'学习日历',needsChild:true},
 {page:'wrong',title:'历史错题集',needsChild:true}
];
export default function Settings(){
 const [signedIn,setSignedIn]=useState(false),[hasChild,setHasChild]=useState(false),[account,setAccount]=useState(''),[visit,setVisit]=useState(0);
 useDidShow(()=>{const token=storage.get('access_token');setSignedIn(!!token);setAccount(token||'');setVisit(v=>v+1);setHasChild(!!token&&!!storage.get('child_id'));});
 return <View className='page settings-page'><View className='title'>设置</View>
 <View className='subtitle'>学习管理</View>
 {!hasChild&&<View className='muted settings-hint'>请先在“家庭与孩子”登录并选择孩子。</View>}
 <View className='card settings-menu'>{entries.map(item=><Button key={item.page} className='settings-entry' disabled={item.needsChild&&!hasChild} onClick={()=>go(item.page)}>
  <View className='settings-entry-copy'><View className='settings-entry-title'>{item.title}</View></View><Text className='settings-chevron'>›</Text>
 </Button>)}</View>
 {signedIn&&<><View className='subtitle'>发音设置</View><View className='card'><AudioPreferences key={account+':'+visit}/></View></>}
 <View className='muted small'>外观跟随微信</View>{DEV_AUTH&&<View className='muted small'>开发环境 · 测试身份与正式数据分开，AI 生成使用真实额度。</View>}
 </View>;
}
