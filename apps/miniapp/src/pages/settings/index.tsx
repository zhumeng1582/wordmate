import {Chevron} from '../../components/Chevron';
import {useState} from 'react';
import {View,Button} from '@tarojs/components';
import {useDidShow} from '@tarojs/taro';
import {go,storage} from '../../services/api';
import './index.css';

const sections=[
 {title:'学习',entries:[
  {page:'settings-tools',title:'学习工具',description:'单词本、收藏、测试与复习',needsChild:true},
  {page:'settings-learning',title:'学习设置',description:'学习目标、发音与自动切换',needsChild:false}
 ]},
 {title:'家庭与 AI',entries:[
  {page:'family',title:'家庭与孩子',description:'家庭成员和孩子档案',needsChild:false},
  {page:'ai-settings',title:'AI 助手',description:'AI 服务与使用额度',needsChild:false},
  {page:'word-tutor',title:'单词聊天记录',description:'查看与小老师的对话',needsChild:true}
 ]},
 {title:'其他',entries:[
  {page:'help',title:'应用说明',description:'使用帮助',needsChild:false},
  {page:'privacy',title:'隐私与数据',description:'隐私说明与数据管理',needsChild:false}
 ]}
];
export default function Settings(){
 const [hasChild,setHasChild]=useState(()=>!!storage.get('access_token')&&!!storage.get('child_id'));
 useDidShow(()=>{setHasChild(!!storage.get('access_token')&&!!storage.get('child_id'));});
 return <View className='page settings-page'><View className='title'>设置</View>
 {!hasChild&&<View className='muted settings-hint'>登录并选择孩子后，可使用学习相关功能。</View>}
 {sections.map(section=><View key={section.title}><View className='subtitle settings-section-title'>{section.title}</View><View className='card settings-menu'>{section.entries.map(item=><Button key={item.page} className='settings-entry' disabled={item.needsChild&&!hasChild} onClick={()=>go(item.page)}><View className='settings-entry-copy'><View className='settings-entry-title'>{item.title}</View><View className='settings-entry-description'>{item.description}</View></View><Chevron className='settings-chevron'/></Button>)}</View></View>)}
 {DEV_AUTH&&<View className='muted small'>开发环境 · 测试身份与正式数据分开，AI 生成使用真实额度。</View>}
 </View>;
}
