import {useRef,useState} from 'react';
import {Button,View} from '@tarojs/components';
import Taro,{useDidHide,useDidShow} from '@tarojs/taro';
import {api,eventId,message,storage} from '../../services/api';
import './index.css';

type Unit={id:string;title:string;word_count:number;joined_book_id:string|null;grade?:number;term?:string};
export default function TextbookBooks(){
 const [items,setItems]=useState<Unit[]>([]),[units,setUnits]=useState<Unit[]>([]),[showUnits,setShowUnits]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const serial=useRef(0),context=useRef('');
 const load=async()=>{const child=storage.get('child_id'),scope=`${storage.get('access_token')}:${child}`,ticket=++serial.current;
  if(context.current!==scope){context.current=scope;setItems([]);setUnits([]);}if(!child){setError('请先选择孩子');return;}setBusy(true);
  try{const [result,unitResult]=await Promise.all([api(`/textbook-volumes?child_id=${encodeURIComponent(child)}`),api(`/children/${encodeURIComponent(child)}/textbook-units`)]);if(ticket!==serial.current||scope!==`${storage.get('access_token')}:${storage.get('child_id')}`)return;setItems(result.items);setUnits(unitResult.items);setError('');}
  catch(e){if(ticket===serial.current)setError(message(e));}finally{if(ticket===serial.current)setBusy(false);}
 };
 useDidShow(()=>{void load();});useDidHide(()=>{serial.current++;});
 const open=async(unit:Unit)=>{const child=storage.get('child_id'),scope=`${storage.get('access_token')}:${child}`;
  if(unit.joined_book_id){storage.set(`current_wordbook:${child}`,unit.joined_book_id);Taro.navigateTo({url:'/pages/words/index'});return;}
  setBusy(true);try{const result=await api(`/children/${child}/textbook-volumes/${unit.id}/join`,'POST',{},eventId());if(scope!==`${storage.get('access_token')}:${storage.get('child_id')}`)return;if(result.skipped_phrases)await Taro.showModal({title:'已跳过短语',content:`词本中有 ${result.skipped_phrases} 条短语或句子，单词库只加入单个英文单词。`,showCancel:false});if(scope!==`${storage.get('access_token')}:${storage.get('child_id')}`)return;storage.set(`current_wordbook:${child}`,result.id);Taro.navigateTo({url:'/pages/words/index'});}catch(e){setError(message(e));}finally{setBusy(false);}
 };
 const practice=async(unit:Unit,mode:'review'|'dictation')=>{const child=storage.get('child_id'),scope=`${storage.get('access_token')}:${child}`;if(busy)return;setBusy(true);setError('');
  try{const book=unit.joined_book_id?{id:unit.joined_book_id}:await api(`/children/${child}/textbook-units/${unit.id}/join`,'POST',{},eventId());if(book.skipped_phrases)await Taro.showModal({title:'已跳过短语',content:`词本中有 ${book.skipped_phrases} 条短语或句子，单词库只加入单个英文单词。`,showCancel:false});const ids:string[]=[];let cursor:string|undefined;do{const page=await api(`/children/${child}/words?limit=100&wordbook_id=${encodeURIComponent(book.id)}${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);ids.push(...page.items.map((word:any)=>word.id));cursor=page.next_cursor;}while(cursor);if(scope!==`${storage.get('access_token')}:${storage.get('child_id')}`)return;if(!ids.length)throw Error('该单元暂无可复习的单词');storage.set('review_source',{source:'manual',word_ids:ids});storage.set('study_intent','start');storage.set('review_mode',mode);await Taro.navigateTo({url:'/pages/review/index'});}catch(e){if(scope===`${storage.get('access_token')}:${storage.get('child_id')}`)setError(message(e));}finally{setBusy(false);}
 };
 return <View className='page'><View className='title'>教材词本</View><View className='muted'>新起航英语 · 按册加入</View><View className='muted small textbook-note'>词汇根据配套教学设计中的核心词汇整理。</View>
  {error&&<View className='error'>{error}<Button className='btn secondary' onClick={()=>void load()}>重试</Button></View>}
  <Button className='btn secondary' disabled={busy} onClick={()=>setShowUnits(value=>!value)}>{showUnits?'查看整册词本':'按单元复习'}</Button>
  {showUnits?units.map(unit=><View className='card textbook-unit' key={unit.id}><View><View className='textbook-title'>{unit.grade}年级{unit.term} · {unit.title}</View><View className='muted small'>{unit.word_count} 个词汇 · 首次复习会加入单元词本</View></View><View className='textbook-unit-actions'><Button className='btn primary' disabled={busy} onClick={()=>void practice(unit,'review')}>复习单元</Button><Button className='btn secondary' disabled={busy} onClick={()=>void practice(unit,'dictation')}>听写单元</Button></View></View>):items.map(unit=><View className='card textbook-unit' key={unit.id}><View><View className='textbook-title'>{unit.title}</View><View className='muted small'>{unit.word_count} 个词汇</View></View><Button className='btn secondary' disabled={busy} onClick={()=>void open(unit)}>{unit.joined_book_id?'查看词本':'加入词本'}</Button></View>)}
  {!busy&&!error&&!(showUnits?units.length:items.length)&&<View className='muted'>暂时没有教材词本。</View>}
 </View>;
}
