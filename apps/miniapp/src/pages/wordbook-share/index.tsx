import {useState} from 'react';
import {Button,View} from '@tarojs/components';
import Taro,{useDidShow,useRouter} from '@tarojs/taro';
import {api,eventId,message,storage} from '../../services/api';
import './index.css';

export default function WordbookShare(){
 const router=useRouter(),bookId=String(router.params.bookId||''),child=storage.get('child_id');
 const [book,setBook]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=async()=>{setBusy(true);try{const data=await api(`/children/${child}/wordbooks`);setBook(data.items.find((x:any)=>x.id===bookId)||null);setError('');}catch(e){setError(message(e));}finally{setBusy(false);}};
 useDidShow(()=>{void load();});
 const stop=async()=>{
  if(!book||busy)return;
  const result=await Taro.showModal({title:'停止历史共享？',content:'其他家庭已加入的独立副本和学习进度会保留。首发暂不提供重新发布。'});if(!result.confirm)return;
  setBusy(true);try{await api(`/children/${child}/wordbooks/${book.id}/share`,'PUT',{published:false},eventId());await load();Taro.showToast({title:'已停止共享',icon:'success'});}catch(e){setError(message(e));setBusy(false);}
 };
 const leave=async()=>{
  if(!book||busy)return;
  const result=await Taro.showModal({title:'离开共享词本？',content:'离开后，这个孩子将不再从该词本学习。首发暂不提供重新加入。'});if(!result.confirm)return;
  setBusy(true);try{await api(`/children/${child}/shared-wordbooks/${book.shared_source_id}/leave`,'POST',{},eventId());Taro.navigateBack();}catch(e){setError(message(e));setBusy(false);}
 };
 return <View className='page'><View className='title'>历史共享管理</View><View className='muted'>首发以家庭共学为主，暂不提供跨家庭公开词本的发布、发现和加入。</View>{book&&<View className='muted'>{book.name} · {book.word_count} 个单词</View>}{error&&<View className='error'>{error}<Button className='btn secondary' disabled={busy} onClick={()=>void load()}>重新加载</Button></View>}{book?.read_only?<View className='card'><View className='notice'>这是此前加入的只读副本，词汇与学习进度仍按本家庭权限保留。</View><Button className='btn secondary' disabled={busy} onClick={()=>void leave()}>离开词本</Button></View>:book&&<View className='card'><View className='notice'>获批家庭成员可共同访问本孩子的词本，无需公开发布。</View>{book.shared_published&&book.shared_can_unpublish?<Button className='btn secondary' disabled={busy} onClick={()=>void stop()}>停止历史共享</Button>:<View className='muted'>{book.shared_published?'请由原发布家长停止历史共享。':'本词本没有进行中的公开共享。'}</View>}</View>}{!book&&!busy&&!error&&<View className='muted'>词本不存在或已移除。</View>}</View>;
}
