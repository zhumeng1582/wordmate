import {SentenceImport} from '../../components/SentenceImport';
import {useState} from 'react';
import Taro,{useLoad,useRouter} from '@tarojs/taro';
import {View,Button} from '@tarojs/components';
import Generation from '../generation/index';
import Poems from '../poems/index';
import HanziImport from '../hanzi-import/index';
export default function ImportReview(){
 const [params,setParams]=useState<Record<string,string|undefined>>(useRouter().params);
 useLoad(query=>{setParams(query);if(!query.kind&&!query.id&&!query.job)void Taro.redirectTo({url:'/pages/import-records/index'});});
 const id=params.id||params.job||'';
 if(params.kind==='sentences'&&id)return <View className='page'><SentenceImport jobId={id}/></View>;
 if(params.kind==='words'&&id)return <Generation taskId={id}/>;
 if(params.kind==='poems'&&id)return <Poems reviewId={id}/>;
 if(params.kind==='hanzi'&&id)return <HanziImport jobId={id}/>;
 return <View className='page'><View className='muted'>请从录入记录选择需要核对的任务。</View><Button className='btn primary' onClick={()=>void Taro.redirectTo({url:'/pages/import-records/index'})}>返回录入记录</Button></View>;
}
