import {ContentActions} from '../../components/ContentActions';
import {confirmMastery} from '../../services/content-marks';
import {isFileCancel} from '../../services/files';
import {SelectableText} from '../../components/SelectableText';
import {useRef,useState} from 'react';
import Taro,{useRouter,useDidShow,useDidHide} from '@tarojs/taro';
import {View,Text,Button,Textarea} from '@tarojs/components';
import {api,message,storage} from '../../services/api';
import {useAudio} from '../../services/audio';
import {sentenceScope} from '../../services/sentence-learning';
import {AudioIcon,AudioFeedback} from '../../components/AudioControls';
import '../words/index.css';
import './index.css';
export default function SentenceDetail(){
 const params=useRouter().params,id=String(params.id||''),bookId=String(params.bookId||''),[item,setItem]=useState<any>(null),[book,setBook]=useState<any>(null),[edit,setEdit]=useState<any>(null),[busy,setBusy]=useState(false),[menuOpen,setMenuOpen]=useState(false),[error,setError]=useState('');
 const menuLock=useRef(false),seq=useRef(0),owner=useRef(''),locked=useRef(false),audio=useAudio(),scope=()=>sentenceScope(storage),current=(n:number,key:string)=>n===seq.current&&key===scope();
 const read=async(n:number,key:string)=>{
  const base=`/children/${storage.get('child_id')}/sentences?book_id=${encodeURIComponent(bookId)}&sentence_id=${encodeURIComponent(id)}&limit=1`;
  let result=await api(`${base}&status=all`);if(!current(n,key))return;
  if(!result.items.length){result=await api(`${base}&status=archived`);if(!current(n,key))return;}
  const found=result.items.find((value:any)=>value.sentence_id===id);if(!found)throw Error('句子已移除或无法访问，请返回列表刷新。');setItem(found);setBook(result.book);setEdit(null);
 };
 const load=async()=>{if(locked.current)return;const n=++seq.current,key=scope();setBusy(true);setError('');try{if(!id||!bookId||!storage.get('child_id'))throw Error('请从句子列表打开详情。');await read(n,key);}catch(e){if(current(n,key))setError(message(e));}finally{if(current(n,key))setBusy(false);}};
 useDidShow(()=>{if(owner.current!==scope()){owner.current=scope();setItem(null);setBook(null);setEdit(null);}void load();});
 useDidHide(()=>{seq.current++;menuLock.current=false;setMenuOpen(false);locked.current=false;setBusy(false);setEdit(null);audio.stop();});
 const update=async(change:any)=>{if(locked.current||busy||!item||owner.current!==scope())return;locked.current=true;setBusy(true);setError('');audio.stop();const n=seq.current,key=scope();try{const saved=await api(`/children/${storage.get('child_id')}/sentences/${encodeURIComponent(id)}`,'PATCH',{...change,expected_version:item.version});if(!current(n,key))return;setItem((old:any)=>({...old,...saved}));setEdit(null);if(typeof change.favorite==='boolean')void Taro.showToast({title:change.favorite?'已收藏':'已取消收藏',icon:'success'});await read(n,key);}catch(e){if(current(n,key))setError(message(e));}finally{if(current(n,key)){locked.current=false;setBusy(false);}}};
 const menu=async(more=false,selected=-1)=>{if(!item||busy||locked.current||menuLock.current||owner.current!==scope())return;menuLock.current=true;setMenuOpen(true);const n=seq.current,key=scope(),valid=()=>current(n,key);try{const choice={tapIndex:selected};if(!valid()||choice.tapIndex!==0)return;if(more){if(!book?.read_only){audio.stop();setEdit({...item});}}else if(await confirmMastery(item.archived_at,valid))await update({archived:!item.archived_at});}catch(e){if(valid()&&!isFileCancel(e))setError(message(e));}finally{if(valid()){menuLock.current=false;setMenuOpen(false);}}};
 const target=item?{sentence_id:item.sentence_id,content_version:item.content_version}:null,active=!!target&&audio.active===JSON.stringify(target);
 return <View className='page sentence-detail'>
 {item&&<><View className='card'><View className='sentence-detail-heading'><SelectableText block className='sentence-detail-english'>{item.text_en}</SelectableText><Button className='sentence-detail-play' aria-label='播放句子发音' onClick={()=>target&&void audio.play(target)}><AudioIcon tone='primary' active={active} playing={active&&audio.status==='正在播放…'}/></Button></View><SelectableText block className='sentence-detail-translation'>{item.translation_zh}</SelectableText><ContentActions name='句子' favorite={!!item.favorite} status={item.archived_at?'已掌握':item.state!=='new'?'学习中':'未学过'} disabled={busy||menuOpen} onFavorite={()=>void update({favorite:!item.favorite})} contextKey={`${scope()}:${id}`} markItems={[item.archived_at?'恢复学习':'标记已掌握']} contentItems={['编辑内容']} onMark={index=>void menu(false,index)} onContent={book&&!book.read_only?index=>void menu(true,index):undefined}/></View><AudioFeedback audio={audio}/></>}
 {busy&&!item&&<View className='muted'>正在加载句子…</View>}
 {error&&<View className='error'>{error}<Button className='text-action' disabled={busy} onClick={()=>void load()}>重新加载</Button></View>}
 {edit&&<View className='book-switch-overlay' onClick={()=>!busy&&setEdit(null)}><View className='book-switch-panel' onClick={e=>e.stopPropagation()}><View className='subtitle'>编辑句子</View>{error&&<View className='error'>{error}</View>}<Textarea className='field' value={edit.text_en} maxlength={1000} disabled={busy} onInput={e=>setEdit({...edit,text_en:e.detail.value})}/><Textarea className='field' value={edit.translation_zh} maxlength={1000} disabled={busy} onInput={e=>setEdit({...edit,translation_zh:e.detail.value})}/><Button className='btn primary' disabled={busy||!edit.text_en.trim()||!edit.translation_zh.trim()} onClick={()=>void update({text_en:edit.text_en,translation_zh:edit.translation_zh})}>保存修改</Button><Button className='text-action' disabled={busy} onClick={()=>setEdit(null)}>取消</Button></View></View>}
 </View>;
}
