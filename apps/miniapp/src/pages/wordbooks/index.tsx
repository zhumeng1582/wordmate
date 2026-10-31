import {useRef,useState} from 'react';
import {Button,Text,View} from '@tarojs/components';
import Taro,{useDidShow,useDidHide} from '@tarojs/taro';
import {api,go,storage,message} from '../../services/api';
import './index.css';
export default function Wordbooks(){
 const [books,setBooks]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const serial=useRef(0),context=useRef(''),ready=useRef(false);
 const refresh=async(quiet=false)=>{
  const ticket=++serial.current,child=storage.get('child_id'),scope=`${storage.get('access_token')}:${child}`,changed=context.current!==scope;
  if(changed){context.current=scope;setBooks([]);ready.current=false;}if(!quiet||!ready.current)setBusy(true);
  try{const data=await api(`/children/${child}/wordbooks`);if(ticket!==serial.current||scope!==`${storage.get('access_token')}:${storage.get('child_id')}`)return;setBooks(data.items);setError('');ready.current=true;}catch(e){if(ticket===serial.current)setError(message(e));}finally{if(ticket===serial.current)setBusy(false);}
 };
 useDidShow(()=>{void refresh(true);});useDidHide(()=>{serial.current++;});
 return <View className='page'><View className='title'>单词本管理</View><View className='muted'>获批家庭成员可共同访问孩子的词本。历史共享副本只能学习，不能编辑。</View>{error&&<View className='error'>{error}<Button className='btn secondary' onClick={()=>void refresh()}>重新加载</Button></View>}<Button className='btn primary' disabled={busy} onClick={()=>go('wordbook-edit')}>＋ 创建单词本</Button>{books.map(book=><View className='book-manage-card card' key={book.id}><View className='book-manage-heading'><View><View className='book-manage-name'>{book.name}</View><Text className='muted small'>{book.word_count} 个单词{book.read_only?' · 历史共享副本':''}</Text></View><Text className={`book-badge ${book.read_only?'readonly':''}`}>{book.read_only?'只读':'家庭词本'}</Text></View><View className='book-manage-actions'>{book.read_only?<Button className='btn secondary' onClick={()=>Taro.navigateTo({url:`/pages/wordbook-share/index?bookId=${book.id}`})}>管理历史共享</Button>:<><Button className='btn secondary' onClick={()=>Taro.navigateTo({url:`/pages/wordbook-edit/index?bookId=${book.id}`})}>编辑词本</Button>{book.shared_published&&book.shared_can_unpublish&&<Button className='btn secondary' onClick={()=>Taro.navigateTo({url:`/pages/wordbook-share/index?bookId=${book.id}`})}>停止历史共享</Button>}</>}</View></View>)}{!books.length&&!busy&&!error&&<View className='muted'>还没有词本，创建一个开始整理单词。</View>}</View>;
}
