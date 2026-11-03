import {useRef,useState} from 'react';
import {Button,View} from '@tarojs/components';
import Taro,{useDidHide,useDidShow} from '@tarojs/taro';
import {api,eventId,message,storage} from '../../services/api';
import './index.css';

type Unit={id:string;title:string;word_count:number;joined_book_id:string|null};
export default function TextbookBooks(){
 const [items,setItems]=useState<Unit[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const serial=useRef(0),context=useRef('');
 const load=async()=>{const child=storage.get('child_id'),scope=`${storage.get('access_token')}:${child}`,ticket=++serial.current;
  if(context.current!==scope){context.current=scope;setItems([]);}if(!child){setError('请先选择孩子');return;}setBusy(true);
  try{const result=await api(`/textbook-volumes?child_id=${encodeURIComponent(child)}`);if(ticket!==serial.current||scope!==`${storage.get('access_token')}:${storage.get('child_id')}`)return;setItems(result.items);setError('');}
  catch(e){if(ticket===serial.current)setError(message(e));}finally{if(ticket===serial.current)setBusy(false);}
 };
 useDidShow(()=>{void load();});useDidHide(()=>{serial.current++;});
 const open=async(unit:Unit)=>{const child=storage.get('child_id'),scope=`${storage.get('access_token')}:${child}`;
  if(unit.joined_book_id){storage.set(`current_wordbook:${child}`,unit.joined_book_id);Taro.navigateTo({url:'/pages/words/index'});return;}
  setBusy(true);try{const result=await api(`/children/${child}/textbook-volumes/${unit.id}/join`,'POST',{},eventId());if(scope!==`${storage.get('access_token')}:${storage.get('child_id')}`)return;storage.set(`current_wordbook:${child}`,result.id);Taro.navigateTo({url:'/pages/words/index'});}catch(e){setError(message(e));}finally{setBusy(false);}
 };
 return <View className='page'><View className='title'>教材词本</View><View className='muted'>新起航英语 · 按册加入</View><View className='muted small textbook-note'>词汇根据配套教学设计中的核心词汇整理。</View>
  {error&&<View className='error'>{error}<Button className='btn secondary' onClick={()=>void load()}>重试</Button></View>}
  {items.map(unit=><View className='card textbook-unit' key={unit.id}><View><View className='textbook-title'>{unit.title}</View><View className='muted small'>{unit.word_count} 个词汇</View></View><Button className='btn secondary' disabled={busy} onClick={()=>void open(unit)}>{unit.joined_book_id?'查看词本':'加入词本'}</Button></View>)}
  {!busy&&!error&&!items.length&&<View className='muted'>暂时没有教材词本。</View>}
 </View>;
}
