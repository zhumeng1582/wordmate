import {useEffect,useRef,useState} from 'react';
import {View,Button,Input,Image,ScrollView} from '@tarojs/components';
import Taro,{useRouter,useDidHide} from '@tarojs/taro';
import {api,eventId,message,storage} from '../../services/api';
import type {AiSettings} from '../../services/ai-settings';
import {tutorRecorder,subscribeTutorRecorder} from '../../services/tutor-recorder';
import {useAudio} from '../../services/audio';
import {AudioFeedback} from '../../components/AudioControls';
import './index.css';

function TutorImageView({id,account,child}:{id:string;account:string;child:string}){
 const [path,setPath]=useState(''),[failed,setFailed]=useState(false);
 useEffect(()=>{let current=true,temp='';void Taro.downloadFile({url:`${API_BASE}/word-tutor-images/${id}/content`,header:{Authorization:`Bearer ${account}`},timeout:30000}).then(result=>{temp=result.tempFilePath;if(current&&String(storage.get('access_token'))===account&&String(storage.get('child_id'))===child&&result.statusCode===200)setPath(temp);else if(current)setFailed(true);if(!current||result.statusCode!==200)Taro.getFileSystemManager().unlink({filePath:temp,fail:()=>{}});}).catch(()=>{if(current)setFailed(true);});return()=>{current=false;if(temp)Taro.getFileSystemManager().unlink({filePath:temp,fail:()=>{}});};},[id,account,child]);
 return path?<View><Image className='tutor-picture' src={path} mode='widthFix' onClick={()=>void Taro.previewImage({urls:[path],current:path})}/><View className='muted small'>AI 生成图片，仅供学习参考</View></View>:<View className='muted small'>{failed?'图片加载失败':'正在加载图片…'}</View>;
}

export default function WordTutor(){
 const audio=useAudio();
 const router=useRouter(),child=String(storage.get('child_id')||''),account=String(storage.get('access_token')||'');
 const [session,setSession]=useState<any>(null),[items,setItems]=useState<any[]>([]),[input,setInput]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[recording,setRecording]=useState(false),[answerFailed,setAnswerFailed]=useState(false),[searchMode,setSearchMode]=useState(false),[pendingQuestion,setPendingQuestion]=useState(''),[keyboardHeight,setKeyboardHeight]=useState(0),[scrollTarget,setScrollTarget]=useState('tutor-bottom-a');
 const recorder=useRef<Taro.RecorderManager|null>(null),discardRecording=useRef(false),recordingRef=useRef(false),sessionRef=useRef<any>(null);sessionRef.current=session;
 const active=useRef(true),pending=useRef<{id:string;question?:string;search:boolean}|null>(null),lastQuestion=useRef<string|undefined>(undefined),lastSearch=useRef(false);
 const valid=()=>active.current&&child===String(storage.get('child_id')||'')&&account===String(storage.get('access_token')||'');
 const answer=async(s:any,question?:string,search=false)=>{
  lastQuestion.current=question;lastSearch.current=search;
  const consentKey=`tutor_notice:${account}:${child}`;if(!storage.get(consentKey)){const consent=await Taro.showModal({title:'使用单词小老师',content:'小老师由 AI 提供，回答可能有误。新单词会自动生成讲解，并使用家庭 AI 额度或你配置的个人 AI 服务。请不要输入姓名、学校或联系方式。',confirmText:'开始使用'});if(!consent.confirm)return;storage.set(consentKey,true);}
  if(search){let prices:AiSettings['tutor_prices'];try{prices=(await api<AiSettings>('/me/ai-settings')).tutor_prices;}catch(e){if(valid())setError(message(e));return;}if(!prices?.search_yuan_per_call||!prices.search_input_yuan_per_million||!prices.search_output_yuan_per_million){setError('联网搜索价格尚未配置。');return;}const key=`tutor_search_notice:${account}:${child}`;if(!storage.get(key)){const notice=await Taro.showModal({title:'联网查资料',content:`提问将发送给联网搜索服务，按 ¥${prices.search_yuan_per_call}/次，加输入 ¥${prices.search_input_yuan_per_million}/百万 Token、输出 ¥${prices.search_output_yuan_per_million}/百万 Token 使用家庭额度。请不要输入个人信息。搜索结果可能有误。`,confirmText:'继续'});if(!notice.confirm)return;storage.set(key,true);}}
  if(!pending.current||pending.current.question!==question||pending.current.search!==search)pending.current={id:eventId(),question,search};
  const request=pending.current;setPendingQuestion(question||'');setBusy(true);setError('');setAnswerFailed(false);
  try{const result=await api(`/word-tutor-sessions/${s.id}/${search?'search':'messages'}`,'POST',{request_id:request.id,...(question===undefined?{}:{question})},undefined,120000);if(valid()){setSession(result);setInput('');setSearchMode(false);pending.current=null;}}
  catch(e:any){if(valid()){if(e?.status&&e.status<500&&e?.message!=='TUTOR_GENERATING')pending.current=null;setAnswerFailed(true);setError(message(e));}}
  finally{if(valid()){setBusy(false);setPendingQuestion('');}}
 };
 const open=async()=>{setBusy(true);setError('');try{
  let data;if(router.params.session)data=await api(`/word-tutor-sessions/${router.params.session}`);else if(router.params.word)data=await api(`/children/${child}/word-tutor-sessions`,'POST',{word_id:router.params.word});else {const result=await api(`/children/${child}/word-tutor-sessions`);if(valid())setItems(result.items);return;}
  if(!valid())return;setSession(data);
  if(!data.messages.length)await answer(data);
 }catch(e){if(valid())setError(message(e));}finally{if(valid())setBusy(false);}};
 useEffect(()=>{void open();return()=>{active.current=false;discardRecording.current=true;if(recordingRef.current)recorder.current?.stop();};},[]);
 useDidHide(()=>{discardRecording.current=true;if(recordingRef.current)recorder.current?.stop();recordingRef.current=false;setRecording(false);setKeyboardHeight(0);});
 useEffect(()=>{if(session)Taro.nextTick(()=>{if(active.current)setScrollTarget(old=>old==='tutor-bottom-a'?'tutor-bottom-b':'tutor-bottom-a');});},[session?.id,session?.messages?.length,busy,keyboardHeight,error]);
 useEffect(()=>{
  const manager=tutorRecorder();recorder.current=manager;
  const stop=async(result:Taro.RecorderManager.OnStopCallbackResult)=>{recordingRef.current=false;if(valid())setRecording(false);const path=result.tempFilePath;
   try{if(discardRecording.current||!valid()||!sessionRef.current)return;if(result.duration<500)throw Error('录音太短，请再试一次。');
    setBusy(true);setError('');setAnswerFailed(false);const audio=await new Promise<string>((resolve,reject)=>Taro.getFileSystemManager().readFile({filePath:path,encoding:'base64',success:r=>resolve(String(r.data)),fail:reject}));
    if(!valid())return;const data=await api(`/word-tutor-sessions/${sessionRef.current.id}/transcriptions`,'POST',{request_id:eventId(),audio_base64:audio},undefined,120000);
    if(valid()){setInput(data.text);if(!data.text)setError('没有听清，请再说一次。');}
   }catch(e){if(valid())setError(message(e));}finally{if(path)Taro.getFileSystemManager().unlink({filePath:path,fail:()=>{}});if(valid())setBusy(false);}
  };
  const fail=()=>{recordingRef.current=false;if(valid()){setRecording(false);setError('录音未完成，请检查麦克风权限后重试。');}};
  return subscribeTutorRecorder(stop,fail);
 },[]);
 const toggleRecord=async()=>{
  if(recordingRef.current){recorder.current?.stop();return;}if(busy)return;
  try{const prices=(await api<AiSettings>('/me/ai-settings')).tutor_prices;if(!prices?.asr_yuan_per_minute){setError('语音识别价格尚未配置。');return;}const noticeKey=`tutor_voice_notice:${account}:${child}`;if(!storage.get(noticeKey)){const notice=await Taro.showModal({title:'使用语音提问',content:`录音将发送给语音识别服务，按 ¥${prices.asr_yuan_per_minute}/分钟使用家庭额度。识别完成后请检查文字，再发送。`,confirmText:'开始录音'});if(!notice.confirm)return;storage.set(noticeKey,true);}
   await Taro.authorize({scope:'scope.record'});if(!valid())return;discardRecording.current=false;recordingRef.current=true;setRecording(true);setError('');recorder.current?.start({duration:60000,format:'mp3',sampleRate:16000,numberOfChannels:1,encodeBitRate:48000});
  }catch{recordingRef.current=false;setRecording(false);setError('无法录音，请在微信设置中允许麦克风权限。');}
 };
 const createImage=async()=>{
  if(!session||busy||recording)return;let price:string|null|undefined;try{price=(await api<AiSettings>('/me/ai-settings')).tutor_prices?.image_yuan_per_image;}catch(e){setError(message(e));return;}if(!price){setError('图片生成价格尚未配置。');return;}const confirm=await Taro.showModal({title:'画给我看',content:`将按当前单词生成一张 AI 图片，使用家庭额度 ¥${price}/张。图片可能不准确。`,confirmText:'生成图片'});if(!confirm.confirm||!valid())return;
  const pendingKey=`tutor_image_pending:${account}:${child}:${session.id}`,id=String(storage.get(pendingKey)||eventId());storage.set(pendingKey,id);
  setBusy(true);setError('');setAnswerFailed(false);try{const started=await api(`/word-tutor-sessions/${session.id}/images`,'POST',{request_id:id});let state=started.state,deadline=Date.now()+300000;
   while(valid()&&state==='running'&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,2000));if(!valid())return;state=(await api(`/word-tutor-images/${id}`)).state;}
   if(!valid())return;if(state==='succeeded'){Taro.removeStorageSync(pendingKey);setSession(await api(`/word-tutor-sessions/${session.id}`));}else{if(state!=='running')Taro.removeStorageSync(pendingKey);throw Error(state==='running'?'图片仍在生成，请稍后返回查看。':'图片生成未完成，请重试。');}
  }catch(e:any){if(e?.status&&e.status<500)Taro.removeStorageSync(pendingKey);if(valid())setError(message(e));}finally{if(valid())setBusy(false);}
 };
 const remove=async(id:string)=>{const choice=await Taro.showModal({title:'删除聊天记录',content:'确定删除这段单词聊天吗？',confirmText:'删除'});if(!choice.confirm)return;try{await api(`/word-tutor-sessions/${id}`,'DELETE',{});setItems(old=>old.filter(item=>item.id!==id));}catch(e){setError(message(e));}};
 if(!session)return <View className='page tutor-page'><View className='title'>{router.params.word||router.params.session?'单词小老师':'单词聊天记录'}</View>{busy&&<View className='muted'>正在准备…</View>}{error&&<View className='error'>{error}<Button className='text-action' onClick={()=>void open()}>重试</Button></View>}{!router.params.word&&!router.params.session&&!busy&&!items.length&&<View className='muted'>还没有聊天记录，从学习页面或词本中打开单词小老师吧。</View>}{items.map(item=><View className='card tutor-history' key={item.id}><Button className='tutor-history-open' onClick={()=>Taro.navigateTo({url:`/pages/word-tutor/index?session=${item.id}`})}><View>{item.lemma}</View><View className='muted small'>{item.meaning_zh}</View></Button><Button className='text-action' onClick={()=>void remove(item.id)}>删除</Button></View>)}</View>;
 return <View className={`tutor-chat ${keyboardHeight?'keyboard-open':''}`} style={{height:`calc(100vh - ${keyboardHeight}px)`}}><View className='tutor-chat-header'><View className='tutor-heading'>{session.lemma}<View className='muted small'>{session.meaning_zh}</View></View><View className='muted small'>AI 生成的内容可能有误，请勿输入个人信息。</View></View>
 <ScrollView className='tutor-scroll' scrollY scrollWithAnimation scrollIntoView={scrollTarget}><View className='tutor-messages'>{session.messages.map((m:any)=><View key={m.id} className={`tutor-row ${m.role==='user'?'tutor-row-user':'tutor-row-assistant'}`}><View className={`tutor-bubble ${m.role==='user'?'tutor-user':'tutor-assistant'}`}><View className='tutor-role'>{m.role==='user'?'我':'小老师 · AI'}</View><View>{m.content}</View>{m.image_id&&<TutorImageView id={m.image_id} account={account} child={child}/>} {!!m.sources?.length&&<View className='tutor-sources'><View>参考来源</View>{m.sources.map((source:any,index:number)=><Button key={`${source.url}:${index}`} className='tutor-source' onClick={()=>void Taro.setClipboardData({data:source.url})}>{source.title} · 复制链接</Button>)}</View>}{m.role==='assistant'&&<Button className='tutor-play' onClick={()=>void audio.play({tutor_message_id:m.id})}>{audio.active===JSON.stringify({tutor_message_id:m.id})?(audio.status||'正在播放…'):'🔊 听讲解'}</Button>}</View></View>)}{busy&&pendingQuestion&&<View className='tutor-row tutor-row-user'><View className='tutor-bubble tutor-user'><View className='tutor-role'>我</View><View>{pendingQuestion}</View></View></View>}{busy&&<View className='tutor-row tutor-row-assistant'><View className='tutor-bubble tutor-assistant tutor-thinking'>小老师正在思考…</View></View>}{audio.error&&<AudioFeedback audio={audio}/>}{error&&<View className='error'>{error}{answerFailed&&<Button className='text-action' disabled={busy} onClick={()=>void answer(session,lastQuestion.current,lastSearch.current)}>重试</Button>}</View>}{!session.messages.length&&!busy&&<Button className='btn secondary' onClick={()=>void answer(session)}>开始讲解</Button>}<View id='tutor-bottom-a' className='tutor-scroll-anchor'/><View id='tutor-bottom-b' className='tutor-scroll-anchor'/></View></ScrollView>
 {!!session.messages.length&&<View className='tutor-composer'>{!keyboardHeight&&<View className='tutor-suggestions'>{['再举个例子','怎么记住它？','考考我'].map(q=><Button key={q} disabled={busy||recording} onClick={()=>void answer(session,q)}>{q}</Button>)}</View>}<View className='tutor-tools'><Button className='tutor-search-toggle' disabled={busy||recording} onClick={()=>void createImage()}>🎨 画给我看</Button><Button className={`tutor-search-toggle ${searchMode?'is-active':''}`} disabled={busy||recording} onClick={()=>setSearchMode(!searchMode)}>{searchMode?'🌐 已开启联网搜索':'🌐 联网搜索'}</Button></View><View className='tutor-compose'><Button className='tutor-record' disabled={busy} onClick={()=>void toggleRecord()}>{recording?'结束录音':'语音'}</Button><Input className='field' value={input} maxlength={1000} placeholder='问问这个单词' adjustPosition={false} onKeyboardHeightChange={e=>setKeyboardHeight(e.detail.height||0)} onBlur={()=>setKeyboardHeight(0)} onInput={e=>setInput(e.detail.value)} onConfirm={()=>{if(input.trim()&&!busy&&!recording)void answer(session,input.trim(),searchMode);}}/><Button className='btn primary' disabled={busy||recording||!input.trim()} onClick={()=>void answer(session,input.trim(),searchMode)}>发送</Button></View></View>}</View>;
}
