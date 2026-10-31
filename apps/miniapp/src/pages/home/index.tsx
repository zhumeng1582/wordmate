import {useRef,useState} from 'react';
import {useDidShow,useDidHide,useShareAppMessage} from '@tarojs/taro';
import {View,Text,Button} from '@tarojs/components';
import {api,storage,go,message,openLogin} from '../../services/api';
import {ReviewSession} from '../../components/ReviewSession';
import {studyKeys,studyCounts,studyComplete,type StudyFlow,type StudySource} from '../../services/study-flow';
import {selectFamilyContext,reconcileFamilyChild} from '../../services/family-context';
import './index.css';

export default function Home(){
 const [reviewing,setReviewing]=useState(false),[today,setToday]=useState<any>(null),[resume,setResume]=useState<StudyFlow|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(()=>!!storage.get('access_token')),[referralCode,setReferralCode]=useState('');
 useShareAppMessage(()=>({title:'每天一点，记得更牢。和我一起学单词吧',path:`/pages/home/index${referralCode?`?ref=${encodeURIComponent(referralCode)}`:''}`}));
 const serial=useRef(0),scope=useRef('');
 const refresh=async()=>{
  const current=++serial.current,token=storage.get('access_token'),contextKey=()=>`${storage.get('access_token')}:${storage.get('child_id')}:${storage.get('family_id')}`;
  let key=contextKey(),child=storage.get('child_id');const changed=scope.current!==key,isCurrent=()=>current===serial.current&&key===contextKey();
  if(changed){setReferralCode('');setToday(null);setResume(null);setReviewing(false);scope.current=key;}if(changed||!today)setError('');
  if(!token){setLoading(false);setReferralCode('');return;}
  if(changed||!today)setLoading(true);
  const me=api('/me');void me.then(data=>{if(isCurrent())setReferralCode(data.referral_code??'');}).catch(()=>{});
  const restoreChild=async()=>{
   const data=await me;if(!isCurrent())return false;
   const family=data.families?.find((item:any)=>item.id===storage.get('family_id'))??data.families?.[0];
   const children=family?await api(`/families/${family.id}/children`):{items:[]};if(!isCurrent())return false;
   selectFamilyContext(storage,family?.id??'');child=reconcileFamilyChild(storage,children.items)?.id??'';key=contextKey();scope.current=key;
   setToday(null);setResume(null);return true;
  };
  try{
   if((!child||!storage.get('family_id'))&&!await restoreChild())return;
   if(!child)return;
   const loadToday=async()=>{
    const keys=studyKeys(token,child),saved=storage.get(keys.resume),pending=storage.get(keys.pending);
    setResume(saved?.format===1&&(!studyComplete(saved)||saved.phase!=='summary'||pending)?saved:null);
    return api(`/children/${child}/today`);
   };
   let result;
   try{result=await loadToday();}catch(e){
    if(!isCurrent())return;
    if(!['CHILD_NOT_FOUND','FAMILY_NOT_FOUND'].includes((e as Error).message))throw e;
    if(!await restoreChild()||!child)return;result=await loadToday();
   }
   if(isCurrent()){setToday(result);setError('');}
  }catch(error){if(isCurrent())setError(message(error));}finally{if(isCurrent())setLoading(false);}
 };
 useDidShow(()=>{void refresh();});useDidHide(()=>{serial.current++;});
 const launch=(source:StudySource,continuing=false)=>{storage.set('review_source',source);storage.set('study_intent',continuing?'resume':'start');setReviewing(true);};
 if(reviewing)return <ReviewSession onExit={()=>{setReviewing(false);void refresh();}}/>;
 const newAvailable=today?Math.min(today.new_count,today.remaining_new_limit):0,newGroup=newAvailable<=9?newAvailable:8,otherActive=!!today?.active_session&&!resume;
 const primary=()=>{if(resume)return launch(resume.source,true);if(today?.due_count)return launch({source:'review'});if(newAvailable)return launch({source:'new_words'});return go(today?.goal_reached?'words':'add-words');};
 return <View className='page home-page'>
  <View className='home-toolbar'><View className='subtitle'>每天一点，记得更牢</View><Button className='home-settings' onClick={()=>go('settings')}>设置 ›</Button></View><View className='title'>今天一起学单词</View>
  {error&&<View className='error'>{error}<Button className='btn' disabled={loading} onClick={()=>void refresh()}>重新加载</Button></View>}
  <View className='card home-progress-card'>
   {loading&&!today?<View className='home-loading muted'>正在加载学习进度…</View>:today?<>
    <View className='home-child-heading'>{today.child.nickname} · 今日学习</View>
    <View className='progress'>{today.completed_words}<Text className='home-goal'> / {today.goal} 词</Text></View>
    <View className='home-goal-track'><View className='home-goal-value' style={{width:`${Math.min(100,today.completed_words*100/Math.max(1,today.goal))}%`}}/></View>
    <View className='muted small'>{today.goal_reached?'今日目标已完成':'每天学一点，按自己的节奏来'}{today.streak_days?` · 连续 ${today.streak_days} 天`:''}</View>
    {resume&&<View className='home-resume-note'>上次已保存 {studyCounts(resume).done} / {resume.total} 词，可接着学。</View>}
    {otherActive?<View className='notice home-active-notice'>有一组学习还在进行中，结束或暂停后即可继续。<Button className='text-action' disabled={loading} onClick={()=>void refresh()}>刷新学习状态</Button></View>:<>
     <Button className='btn primary home-start' disabled={loading||!!error} onClick={primary}>{resume?'继续上次学习':today.due_count?`开始今日复习 · ${Math.min(100,today.due_count)} 词`:newAvailable?`学一组新词 · ${newGroup} 词`:today.goal_reached?'看看我的单词本':'添加新的学习材料'}</Button>
     {resume?<View className='home-other-learning'>{today.due_count>0&&<Button className='home-secondary-action' disabled={loading||!!error} onClick={()=>launch({source:'review'})}>今日复习</Button>}{newAvailable>0&&<Button className='home-secondary-action' disabled={loading||!!error} onClick={()=>launch({source:'new_words'})}>学习新词</Button>}</View>:today.due_count>0&&newAvailable>0?<Button className='home-secondary-action' disabled={loading||!!error} onClick={()=>launch({source:'new_words'})}>我想先学新词 · {newGroup} 词</Button>:null}
    </>}
    <View className='home-queue-summary'>待复习 {today.due_count} 词 · 今日还可学 {newAvailable} 个新词</View>
    <View className='home-shortcuts'>{([['words','单词本'],['calendar','学习日历'],['quiz','月度测验'],['wrong','错题集']] as const).map(([page,label])=><Button key={page} className='home-shortcut' onClick={()=>go(page)}>{label}<Text>›</Text></Button>)}</View>
   </>:error?<View className='home-loading muted'>暂时无法加载学习进度，请重试。</View>:<><View className='home-welcome'>和孩子一起，积累每天的进步。</View><View className='muted'>{storage.get('access_token')?'添加孩子档案，开始记录每天的进步。':'先登录，为孩子保存独立的学习记录。'}</View><Button className='btn primary' onClick={()=>storage.get('access_token')?go('family'):void openLogin()}>{storage.get('access_token')?'添加孩子档案':'微信登录，开始学习'}</Button></>}
  </View>
  {referralCode&&<Button className='btn secondary referral-share-button' openType='share'>分享小程序给好友</Button>}
 </View>;
}
