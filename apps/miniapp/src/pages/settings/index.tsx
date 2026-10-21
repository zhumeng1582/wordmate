import {useState} from 'react';
import {View,Text,Button} from '@tarojs/components';
import {useDidShow} from '@tarojs/taro';
import {go,storage} from '../../services/api';
import {AudioPreferences} from '../../components/AudioPreferences';
import './index.css';
const entries=[
 {page:'words',title:'单词本',needsChild:true},
 {page:'family',title:'家庭与孩子',needsChild:false},
 {page:'quiz',title:'按月测验',needsChild:true},
 {page:'calendar',title:'学习日历',needsChild:true},
 {page:'wrong',title:'历史错题集',needsChild:true}
];
export default function Settings(){
 const [privacyOpen,setPrivacyOpen]=useState(false);
 const [signedIn,setSignedIn]=useState(false),[hasChild,setHasChild]=useState(false),[account,setAccount]=useState(''),[visit,setVisit]=useState(0);
 useDidShow(()=>{const token=storage.get('access_token');setSignedIn(!!token);setAccount(token||'');setVisit(v=>v+1);setHasChild(!!token&&!!storage.get('child_id'));});
 return <View className='page settings-page'><View className='title'>设置</View>
 <View className='subtitle'>学习管理</View>
 {!hasChild&&<View className='muted settings-hint'>请先在“家庭与孩子”登录并选择孩子。</View>}
 <View className='card settings-menu'>{entries.map(item=><Button key={item.page} className='settings-entry' disabled={item.needsChild&&!hasChild} onClick={()=>go(item.page)}>
  <View className='settings-entry-copy'><View className='settings-entry-title'>{item.title}</View></View><Text className='settings-chevron'>›</Text>
 </Button>)}</View>
 {signedIn&&<><View className='subtitle'>发音设置</View><View className='card'><AudioPreferences key={account+':'+visit}/></View></>}
 <Button className='text-action' onClick={()=>setPrivacyOpen(open=>!open)}>隐私说明 {privacyOpen?'▴':'›'}</Button>
 {privacyOpen&&<View className='card'><View className='settings-entry-title'>AI 内容与数据使用</View><View className='muted'>提交的词汇或文本会发送给配置的 AI 服务，用于识别单词并生成音标、释义、翻译和例句。这些内容由 AI 生成，可能存在错误，仅供学习参考。</View><View className='muted'>播放发音时，待朗读的单词或句子可能发送给语音合成服务；生成的音频会存储并复用。</View><View className='muted'>请勿在录入内容中包含密码、密钥或与学习无关的个人敏感信息。</View></View>}
 <View className='muted small'>外观跟随微信</View>{DEV_AUTH&&<View className='muted small'>开发环境 · 测试身份与正式数据分开，AI 生成使用真实额度。</View>}
 </View>;
}
