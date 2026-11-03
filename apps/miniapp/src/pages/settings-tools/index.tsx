import {useState} from 'react';
import {View,Button} from '@tarojs/components';
import {useDidShow} from '@tarojs/taro';
import {Chevron} from '../../components/Chevron';
import {go,storage} from '../../services/api';
import '../settings/index.css';

const sections=[
 {title:'词本',entries:[['words','单词本'],['add-words','添加单词'],['word-search','搜索单词'],['wordbooks','词本管理与发现'],['favorites','收藏单词']]},
 {title:'练习与复习',entries:[['quiz','单词测试'],['calendar','按日期复习'],['wrong','错题集']]}
];
export default function SettingsTools(){
 const [hasChild,setHasChild]=useState(()=>!!storage.get('access_token')&&!!storage.get('child_id'));
 useDidShow(()=>setHasChild(!!storage.get('access_token')&&!!storage.get('child_id')));
 return <View className='page settings-page'><View className='title'>学习工具</View>{!hasChild&&<View className='muted settings-hint'>请先登录并选择孩子。</View>}{sections.map(section=><View key={section.title}><View className='subtitle settings-section-title'>{section.title}</View><View className='card settings-menu'>{section.entries.map(([page,title])=><Button key={page} className='settings-entry' disabled={!hasChild} onClick={()=>go(page)}><View className='settings-entry-title'>{title}</View><Chevron className='settings-chevron'/></Button>)}</View></View>)}</View>;
}
