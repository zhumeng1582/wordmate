import {useState} from 'react';
import {View,Button} from '@tarojs/components';
import Taro,{useDidShow,useRouter} from '@tarojs/taro';
import {Chevron} from '../../components/Chevron';
import {storage} from '../../services/api';
import type {LibraryKind} from '../../services/library-navigation';
import '../settings/index.css';
type Entry={page:string;title:string;query?:string};
export default function SettingsTools(){
 const route=useRouter(),kind:LibraryKind=route.params.kind==='poems'?'poems':route.params.kind==='hanzi'?'hanzi':route.params.kind==='sentences'?'sentences':'words',hanzi=kind==='hanzi',poems=kind==='poems';
 const [hasChild,setHasChild]=useState(()=>!!storage.get('access_token')&&!!storage.get('child_id'));
 useDidShow(()=>setHasChild(!!storage.get('access_token')&&!!storage.get('child_id')));
 const titles:Record<LibraryKind,string>={words:'单词工具',sentences:'句子工具',poems:'古诗工具',hanzi:'汉字工具'};
 const sections:{title:string;entries:Entry[]}[]=kind==='sentences'?[
  {title:'收藏与标记',entries:[{page:'sentences',title:'收藏句子',query:'status=favorite'},{page:'sentences',title:'易忘句',query:'status=wrong'}]},
  {title:'学习记录',entries:[{page:'calendar',title:'句子学习日历',query:'kind=sentences'}]}
 ]:poems?[{title:'收藏与标记',entries:[{page:'poems',title:'收藏诗词',query:'status=favorite'}]}]:[
  {title:'收藏与标记',entries:hanzi?[{page:'hanzi',title:'收藏汉字',query:'status=favorite'},{page:'hanzi',title:'重点字',query:'status=important'}]:[{page:'favorites',title:'收藏单词'}]},
  {title:'测试与练习',entries:hanzi?[
   {page:'hanzi-monthly',title:'汉字测试'},
   {page:'hanzi-quiz',title:'拼音练习'},
   {page:'hanzi-quiz',title:'组词练习',query:'mode=words'}
  ]:[{page:'quiz',title:'单词测试'}]},
  {title:'错题整理',entries:hanzi?[{page:'hanzi',title:'错字集',query:'status=wrong'}]:[{page:'wrong',title:'错题集'}]}
 ];
 return <View className='page settings-page'><View className='title'>{titles[kind]}</View>{!hasChild&&<View className='muted settings-hint'>请先登录并选择孩子。</View>}{sections.map(section=><View key={section.title}><View className='subtitle settings-section-title'>{section.title}</View><View className='card settings-menu'>{section.entries.map(entry=><Button key={entry.page+entry.title} className='settings-entry' disabled={!hasChild} onClick={()=>void Taro.navigateTo({url:`/pages/${entry.page}/index${entry.query?`?${entry.query}`:''}`})}><View className='settings-entry-title'>{entry.title}</View><Chevron className='settings-chevron'/></Button>)}</View></View>)}</View>;
}
