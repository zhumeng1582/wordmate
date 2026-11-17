import {Icon,type IconName} from '../../components/Icon';
import {Chevron} from '../../components/Chevron';
import {useState} from 'react';
import {View,Button} from '@tarojs/components';
import Taro,{useDidShow} from '@tarojs/taro';
import {go,storage} from '../../services/api';
import './index.css';

const settingsIcons:Record<string,IconName>={'settings-home':'home','settings-tools':'book','settings-learning':'settings',calendar:'calendar',import:'plus','import-records':'history',wordbooks:'book',family:'family','ai-settings':'sparkles','word-tutor':'chat',help:'help',privacy:'shield'};
const sections=[
 {title:'辅助工具',entries:[
  {page:'settings-tools',title:'单词工具',description:'收藏单词、单词测试与错题集',needsChild:true,kind:'words'},
  {page:'settings-tools',title:'句子工具',description:'收藏句子、易忘句与句子学习日历',needsChild:true,kind:'sentences'},
  {page:'settings-tools',title:'古诗工具',description:'查看收藏的古诗词',needsChild:true,kind:'poems'},
  {page:'settings-tools',title:'汉字工具',description:'重点字、专项练习与错字集',needsChild:true,kind:'hanzi'},
  {page:'calendar',title:'打卡与补卡',description:'查看打卡日历，补签过去漏打卡的日期',needsChild:true,url:'/pages/calendar/index?mode=makeup'}
 ]},
 {title:'录入与词本',entries:[
  {page:'import',title:'录入学习内容',description:'输入文字、拍照或导入文件',needsChild:true},
  {page:'import-records',title:'录入记录',description:'查看进度、继续核对与处理未完成任务',needsChild:true},
  {page:'wordbooks',title:'词本管理与发现',description:'统一管理单词、句子、古诗和汉字词本及共享',needsChild:true}
 ]},
 {title:'偏好设置',entries:[
  {page:'settings-home',title:'首页显示',description:'选择学习内容和排列顺序',needsChild:false,needsAccount:true},
  {page:'settings-learning',title:'学习设置',description:'每日目标、英语发音和学习交互',needsChild:false}
 ]},
 {title:'家庭与 AI',entries:[
  {page:'family',title:'家庭与孩子',description:'家庭成员和孩子档案',needsChild:false},
  {page:'ai-settings',title:'AI 助手',description:'AI 服务与使用额度',needsChild:false},
  {page:'word-tutor',title:'AI 学童聊天记录',description:'继续单词、诗词和汉字的对话',needsChild:true}
 ]},
 {title:'帮助与隐私',entries:[
  {page:'help',title:'应用说明',description:'使用帮助',needsChild:false},
  {page:'privacy',title:'隐私与数据',description:'隐私说明与数据管理',needsChild:false}
 ]}
];
export default function Settings(){
 const [hasChild,setHasChild]=useState(()=>!!storage.get('access_token')&&!!storage.get('child_id'));
 const [account,setAccount]=useState(()=>String(storage.get('access_token')||''));
 useDidShow(()=>{const token=String(storage.get('access_token')||'');setHasChild(!!token&&!!storage.get('child_id'));setAccount(token);});
 return <View className='page settings-page'><View className='title'>设置</View>
 {!hasChild&&<View className='muted settings-hint'>登录并选择孩子后，可使用学习相关功能。</View>}
 {sections.map(section=><View key={section.title}><View className='subtitle settings-section-title'>{section.title}</View><View className='card settings-menu'>{section.entries.filter(item=>!('needsAccount' in item)||!!account).map(item=><Button key={item.page+('kind' in item?item.kind:'')} className='settings-entry' disabled={item.needsChild&&!hasChild} onClick={()=>'url' in item?void Taro.navigateTo({url:item.url!}):'kind' in item&&item.kind!=='words'?void Taro.navigateTo({url:`/pages/settings-tools/index?kind=${item.kind}`}):go(item.page)}><View className='settings-entry-icon'><Icon name={settingsIcons[item.page]}/></View><View className='settings-entry-copy'><View className='settings-entry-title'>{item.title}</View><View className='settings-entry-description'>{item.description}</View></View><Chevron className='settings-chevron'/></Button>)}</View></View>)}
 {DEV_AUTH&&<View className='muted small'>开发环境 · 测试身份与正式数据分开，AI 生成使用真实额度。</View>}
 </View>;
}
