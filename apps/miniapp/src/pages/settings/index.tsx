import {useState} from 'react';
import {View,Text,Button} from '@tarojs/components';
import {useDidShow} from '@tarojs/taro';
import {go,storage} from '../../services/api';
import {LearningGoal} from '../../components/LearningGoal';
import {AudioPreferences} from '../../components/AudioPreferences';
import './index.css';
const entries=[
 {page:'ai-settings',title:'AI 助手',needsChild:false},
 {page:'words',title:'单词本',needsChild:true},
 {page:'family',title:'家庭与孩子',description:'切换孩子、管理家长与邀请',needsChild:false},
 {page:'quiz',title:'按月测验',needsChild:true},
 {page:'calendar',title:'学习日历',needsChild:true},
 {page:'wrong',title:'历史错题集',needsChild:true}
];
export default function Settings(){
 const [signedIn,setSignedIn]=useState(()=>!!storage.get('access_token')),[hasChild,setHasChild]=useState(()=>!!storage.get('access_token')&&!!storage.get('child_id')),[account,setAccount]=useState(()=>storage.get('access_token')||''),[child,setChild]=useState(()=>storage.get('child_id')||'');
 useDidShow(()=>{const token=storage.get('access_token'),currentChild=storage.get('child_id');setSignedIn(!!token);setAccount(token||'');setChild(currentChild||'');setHasChild(!!token&&!!currentChild);});
 return <View className='page settings-page'><View className='title'>设置</View>
 <View className='subtitle'>学习管理</View>
 {!hasChild&&<View className='muted settings-hint'>请先在“家庭与孩子”登录并选择孩子。</View>}
 <View className='card settings-menu'>{entries.map(item=><Button key={item.page} className='settings-entry' disabled={item.needsChild&&!hasChild} onClick={()=>go(item.page)}>
  <View className='settings-entry-copy'><View className='settings-entry-title'>{item.title}</View>{item.description&&<View className='settings-entry-description'>{item.description}</View>}</View><Text className='settings-chevron'>›</Text>
 </Button>)}</View>
 {hasChild&&<><View className='subtitle'>学习目标</View><View className='card'><LearningGoal key={account+':'+child}/></View></>}
 {signedIn&&<><View className='subtitle'>发音设置</View><View className='card'><AudioPreferences key={account}/></View></>}
 <Button className='btn secondary' onClick={()=>go('help')}>应用说明</Button>
 <Button className='btn secondary' onClick={()=>go('privacy')}>隐私与数据管理</Button>
 <View className='muted small'>外观跟随微信</View>{DEV_AUTH&&<View className='muted small'>开发环境 · 测试身份与正式数据分开，AI 生成使用真实额度。</View>}
 </View>;
}
