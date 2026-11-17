import {SentenceImport} from '../../components/SentenceImport';
import {useState} from 'react';
import Taro,{useRouter} from '@tarojs/taro';
import {View,Button} from '@tarojs/components';
import {Icon} from '../../components/Icon';
import WordImport from '../add-words/index';
import HanziImport from '../hanzi-import/index';
import Poems from '../poems/index';
import './index.css';
export default function Import(){
 const params=useRouter().params,[kind,setKind]=useState(['poems','hanzi','sentences'].includes(params.kind||'')?params.kind!:'words'),[busy,setBusy]=useState(false);
 return <View className='page unified-import'><View className='book-page-heading'><View className='title'>录入学习内容</View><Button className='library-header-button' aria-label='录入记录' disabled={busy} onClick={()=>void Taro.navigateTo({url:'/pages/import-records/index'})}><Icon name='history'/></Button></View><View className='import-kind-tabs'>{[['words','单词'],['poems','古诗'],['hanzi','汉字'],['sentences','句子']].map(([key,label])=><Button key={key} className={`import-kind-tab ${kind===key?'selected':''}`} disabled={busy} onClick={()=>setKind(key)}>{label}</Button>)}</View><View className='unified-import-body'>{kind==='sentences'?<SentenceImport onBusyChange={setBusy}/>:kind==='words'?<WordImport embedded onBusyChange={setBusy}/>:kind==='hanzi'?<HanziImport embedded onBusyChange={setBusy}/>:<Poems entryMode='import' embedded onBusyChange={setBusy}/>}</View></View>;
}
