import {Icon} from '../../components/Icon';
import {useRef,useState} from 'react';
import Taro,{useDidShow,useDidHide,useRouter} from '@tarojs/taro';
import {View,Button,Text} from '@tarojs/components';
import {api,message,storage} from '../../services/api';
import '../wordbooks/index.css';
import './index.css';
type Source='shared_wordbook'|'shared_hanzi_book'|'shared_poem_book'|'shared_sentence_book'|'textbook';
const sources:Source[]=['shared_wordbook','shared_hanzi_book','shared_poem_book','shared_sentence_book','textbook'];
const routes={shared_wordbook:'shared-wordbooks',shared_hanzi_book:'shared-hanzi-books',shared_poem_book:'shared-poem-books',shared_sentence_book:'shared-sentence-books',textbook:'textbook-volumes'};
export default function Discover(){
 const params=useRouter().params,initialKind=['words','hanzi','poems','sentences'].includes(params.kind||'')?params.kind!:'',[kind,setKind]=useState(initialKind);
 const selectedSources=(value:string)=>sources.filter(source=>!value||(value==='words'?['shared_wordbook','textbook'].includes(source):source===({hanzi:'shared_hanzi_book',poems:'shared_poem_book',sentences:'shared_sentence_book'} as Record<string,string>)[value]));
 const [items,setItems]=useState<any[]>([]),[offsets,setOffsets]=useState<Partial<Record<Source,number|null>>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[tab,setTab]=useState('all'),[grade,setGrade]=useState('');
 const seq=useRef(0),owner=useRef(''),scope=()=>`${storage.get('access_token')}:${storage.get('child_id')}`;
 const load=async(more=false,selectedKind=kind)=>{const ticket=++seq.current,key=scope();setBusy(true);setError('');try{
  if(!storage.get('access_token')||!storage.get('child_id'))throw Error('请先登录并选择孩子。');
  const [profile,results]=await Promise.all([storage.get('family_id')?api(`/families/${storage.get('family_id')}/children`).catch(()=>({items:[]})):Promise.resolve({items:[]}),Promise.all(selectedSources(selectedKind).filter(source=>!more||((tab==='all'||(tab==='textbook'?source==='textbook':source!=='textbook'))&&offsets[source]!=null)).map(async source=>{
   const result=await api(`/${routes[source]}?child_id=${encodeURIComponent(storage.get('child_id'))}${source==='textbook'?'':`&limit=50&offset=${more?offsets[source]:0}`}`);
   return {source,items:result.items.map((book:any)=>({...book,source})),next:source==='textbook'?null:result.next_offset??null};
  }))]);
  if(ticket!==seq.current||key!==scope())return;
  setGrade(profile.items.find((child:any)=>child.id===storage.get('child_id'))?.school_grade||'');
  setItems(old=>{const combined=more?[...old,...results.flatMap(r=>r.items)]:results.flatMap(r=>r.items);return combined.filter((book,i)=>combined.findIndex(b=>b.source===book.source&&b.id===book.id)===i);});
  setOffsets(old=>({...old,...Object.fromEntries(results.map(r=>[r.source,r.next]))}));
 }catch(e){if(ticket===seq.current&&key===scope())setError(message(e));}finally{if(ticket===seq.current&&key===scope())setBusy(false);}};
 useDidShow(()=>{if(owner.current!==scope()){owner.current=scope();setItems([]);setOffsets({});setTab('all');setGrade('');}void load();});
 useDidHide(()=>{seq.current++;setBusy(false);});
 const gradeNumber=(text:string)=>{const match=text.match(/([1-6一二三四五六])年级/);return match?'一二三四五六'.indexOf(match[1])>=0?String('一二三四五六'.indexOf(match[1])+1):match[1]:'';};
 const recommended=(book:any)=>book.source==='textbook'&&grade.startsWith('小学')&&!!gradeNumber(grade)&&gradeNumber(book.grade||'')===gradeNumber(grade);
 const visible=items.filter(book=>selectedSources(kind).includes(book.source)).filter(book=>tab==='all'||(tab==='textbook'?book.source==='textbook':book.source!=='textbook')).sort((a,b)=>Number(recommended(b))-Number(recommended(a)));
 const hasMore=selectedSources(kind).some(source=>(tab==='all'||(tab==='textbook'?source==='textbook':source!=='textbook'))&&offsets[source]!=null);
 return <View className='page discover-page'><View className='book-page-heading'><View className='title'>发现词本</View><View className='book-header-actions'><Button className='book-header-icon' aria-label='创建词本' disabled={busy} onClick={()=>void Taro.showActionSheet({itemList:['单词词本','汉字词本','古诗词本','英语句子本']}).then(r=>Taro.navigateTo({url:`/pages/${['wordbook-edit','hanzi-book-edit','poem-book-edit','sentence-book-edit'][r.tapIndex]}/index`})).catch(()=>{})}><Icon name='plus'/></Button><Button className='book-header-icon' aria-label='搜索' onClick={()=>void Taro.navigateTo({url:'/pages/search/index'})}><Icon name='search'/></Button></View></View><View className='muted'>浏览单词、句子、古诗、汉字与教材词本，预览后加入。</View>
 {kind&&<View className='discover-kind-scope'><Text>正在浏览{({words:'单词',hanzi:'汉字',poems:'古诗',sentences:'句子'} as Record<string,string>)[kind]}词本</Text><Button className='text-action' onClick={()=>{setKind('');setTab('all');setItems([]);setOffsets({});void load(false,'');}}>查看全部类型</Button></View>}
 {(!kind||kind==='words')&&<View className='book-browse-tabs'>{[['all','全部'],['textbook','教材'],['shared','家庭共享']].map(([key,label])=><Button key={key} className={`book-browse-tab ${tab===key?'selected':''}`} onClick={()=>setTab(key)}>{label}</Button>)}</View>}
 {error&&<View className='error'>{error}<Button className='text-action' disabled={busy} onClick={()=>void load()}>重新加载</Button></View>}
 {visible.map(book=><View className='discover-card card' key={`${book.source}:${book.id}`}><View className='discover-title'>{book.title}{recommended(book)&&<Text className='book-recommend-label'>适合当前年级</Text>}</View><View className='muted small'>{book.source==='shared_hanzi_book'?'汉字':book.source==='shared_poem_book'?'古诗':book.source==='shared_sentence_book'?'句子':'单词'} · {book.sentence_count??book.poem_count??book.hanzi_count??book.word_count??book.items?.length??0} {book.source==='shared_poem_book'?'首':book.source==='shared_sentence_book'?'句':'个'}{book.source==='shared_hanzi_book'?'汉字':book.source==='shared_poem_book'?'古诗':book.source==='shared_sentence_book'?'':'单词'} · {book.source==='textbook'?'教材词本':book.author||'公开词本'}</View><View className='muted small discover-categories'>{[book.grade,book.textbook,book.category].filter(Boolean).join(' · ')}</View>{book.description&&<View className='discover-description'>{book.description}</View>}<Button className='btn secondary' disabled={book.is_source} onClick={()=>void Taro.navigateTo({url:`/pages/book-preview/index?kind=${book.source}&id=${encodeURIComponent(book.id)}`})}>{book.is_source?'当前孩子的词本':book.joined_book_id?'查看已加入的词本':'预览词本'}</Button></View>)}
 {busy&&<View className='muted'>正在加载…</View>}{!busy&&!error&&!visible.length&&<View className='muted'>没有符合条件的词本，可尝试搜索。</View>}{hasMore&&<Button className='btn secondary' disabled={busy} onClick={()=>void load(true)}>加载更多</Button>}</View>;
}
