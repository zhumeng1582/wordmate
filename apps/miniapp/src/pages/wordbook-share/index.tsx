import {useState} from 'react';
import {Button,Input,Switch,Textarea,View} from '@tarojs/components';
import Taro,{useDidShow,useRouter} from '@tarojs/taro';
import {api,eventId,message,storage} from '../../services/api';
import './index.css';

export default function WordbookShare(){
 const router=useRouter(),bookId=String(router.params.bookId||''),child=storage.get('child_id');
 const [book,setBook]=useState<any>(null),[published,setPublished]=useState(false),[title,setTitle]=useState(''),[author,setAuthor]=useState(''),[description,setDescription]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=async()=>{setBusy(true);try{const data=await api(`/children/${child}/wordbooks`),item=data.items.find((x:any)=>x.id===bookId)||null;setBook(item);setPublished(!!item?.shared_published);setTitle(item?.shared_title||item?.name||'');setAuthor(item?.shared_author||'');setDescription(item?.shared_description||'');setError('');}catch(e){setError(message(e));}finally{setBusy(false);}};
 useDidShow(()=>{void load();});
 const save=async()=>{if(!book||busy)return;setBusy(true);setError('');try{await api(`/children/${child}/wordbooks/${book.id}/share`,'PUT',published?{published:true,title:title.trim(),author:author.trim(),description:description.trim()}:{published:false},eventId());Taro.showToast({title:published?'已开启共享':'已关闭共享',icon:'success'});await load();}catch(e){setError(message(e));setBusy(false);}};
 const leave=async()=>{if(!book||busy)return;const result=await Taro.showModal({title:'离开共享词本？',content:'离开后将不再从此词本学习；可以稍后重新加入。'});if(!result.confirm)return;setBusy(true);try{await api(`/children/${child}/shared-wordbooks/${book.shared_source_id}/leave`,'POST',{},eventId());Taro.navigateBack();}catch(e){setError(message(e));setBusy(false);}};
 const editable=!book?.shared_title||book?.shared_can_unpublish;
 return <View className='page'><View className='title'>词本共享</View>{book&&<View className='muted'>{book.name} · {book.word_count} 个单词</View>}{error&&<View className='error'>{error}<Button className='text-action' disabled={busy} onClick={()=>void load()}>重新加载</Button></View>}
 {book?.read_only?<View className='card'><View className='muted'>这是加入的共享词本，学习进度独立保存。</View><Button className='btn secondary' disabled={busy} onClick={()=>void leave()}>离开词本</Button></View>:book&&<View className='card'>
 <View className='share-switch-row'><View className='share-switch-title'>公开共享</View><Switch checked={published} disabled={busy||!editable} onChange={e=>setPublished(e.detail.value)}/></View>
 <View className='muted small share-note'>开启后，其他用户可以搜索并加入词本。名称、作者、简介、分类、单词、释义和例句会公开，请勿填写个人隐私信息。关闭后，已加入的副本会保留。</View>{published&&[book.grade,book.textbook,book.category].filter(Boolean).length>0&&<View className='muted small'>公开分类：{[book.grade,book.textbook,book.category].filter(Boolean).join(' · ')}</View>}
 {!editable?<View className='muted'>请由开启共享的家长管理。</View>:<>{published&&<><Input className='field' value={title} maxlength={60} placeholder='公开词本名称' onInput={e=>setTitle(e.detail.value)}/><Input className='field' value={author} maxlength={60} placeholder='作者名' onInput={e=>setAuthor(e.detail.value)}/><Textarea className='field share-description' value={description} maxlength={300} placeholder='词本简介（选填）' onInput={e=>setDescription(e.detail.value)}/><View className='muted small'>更新词本后，保存共享设置可同步公开内容。</View></>}
 <Button className='btn primary share-save' disabled={busy||(published&&(!title.trim()||!author.trim()||!book.word_count))||(!published&&!book.shared_published)} onClick={()=>void save()}>{busy?'保存中…':'保存共享设置'}</Button>{published&&!book.word_count&&<View className='muted small'>添加单词后即可开启共享。</View>}</>}
 </View>}{!book&&!busy&&!error&&<View className='muted'>词本不存在或已移除。</View>}</View>;
}
