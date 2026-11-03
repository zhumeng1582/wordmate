import {CheckinStatus} from '../../components/CheckinStatus';
import {useCheckinShare} from '../../components/useCheckinShare';
import {Chevron} from '../../components/Chevron';
import {useRef,useState} from 'react';
import Taro,{useDidShow,useDidHide,useShareAppMessage} from '@tarojs/taro';
import {View,Text,Button} from '@tarojs/components';
import {api,storage,go,message,openLogin} from '../../services/api';
import {ReviewSession} from '../../components/ReviewSession';
import {studyKeys,studyCounts,studyComplete,nextNewGroupSize,type StudyFlow,type StudySource} from '../../services/study-flow';
import {selectFamilyContext,reconcileFamilyChild} from '../../services/family-context';
import {familyInviteStatus,type FamilyInviteNotice} from '../../services/family-invite-status';
import './index.css';

export default function Home(){
 const [reviewing,setReviewing]=useState(false),[today,setToday]=useState<any>(null),[bookStats,setBookStats]=useState<{learned:number;total:number}|null>(null),[statsStatus,setStatsStatus]=useState<'loading'|'ready'|'unavailable'>('loading'),[resume,setResume]=useState<StudyFlow|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(()=>!!storage.get('access_token')),[referralCode,setReferralCode]=useState(''),[familyInvite,setFamilyInvite]=useState<FamilyInviteNotice|null>(null),[joiningFamily,setJoiningFamily]=useState(false);
 const checkinDate=today?.date??new Date(Date.now()+8*3600000).toISOString().slice(0,10),checkinShare=useCheckinShare(checkinDate);
 useShareAppMessage(()=>({title:'每天一点，记得更牢。和我一起学单词吧',path:`/pages/home/index${referralCode?`?ref=${encodeURIComponent(referralCode)}`:''}`}));
 const serial=useRef(0),scope=useRef('');
 const refresh=async()=>{
  const current=++serial.current,token=storage.get('access_token'),contextKey=()=>`${storage.get('access_token')}:${storage.get('child_id')}:${storage.get('family_id')}:${storage.get(`current_wordbook:${storage.get('child_id')}`)}`;
  let key=contextKey(),child=storage.get('child_id');const changed=scope.current!==key,isCurrent=()=>current===serial.current&&key===contextKey();
  if(changed){setReferralCode('');setFamilyInvite(null);setToday(null);setBookStats(null);setStatsStatus('loading');setResume(null);setReviewing(false);scope.current=key;}if(changed||!today)setError('');
  if(!token){setLoading(false);setReferralCode('');setFamilyInvite(null);return;}
  if(changed||!today)setLoading(true);
  const me=api('/me');void me.then(data=>{
   if(!isCurrent())return;
   setReferralCode(data.referral_code??'');
   const result=familyInviteStatus(data,storage.get('pending_family_invite'),token,storage.get('family_id'));
   if(result.clear)Taro.removeStorageSync('pending_family_invite');
   if(result.track)storage.set('pending_family_invite',result.track);
   setFamilyInvite(result.notice);
  }).catch(()=>{});
  const restoreChild=async()=>{
   const data=await me;if(!isCurrent())return false;
   const family=data.families?.find((item:any)=>item.id===storage.get('family_id'))??data.families?.[0];
   const children=family?await api(`/families/${family.id}/children`):{items:[]};if(!isCurrent())return false;
   selectFamilyContext(storage,family?.id??'');child=reconcileFamilyChild(storage,children.items)?.id??'';key=contextKey();scope.current=key;
   setToday(null);setBookStats(null);setStatsStatus('loading');setResume(null);return true;
  };
  try{
   if((!child||!storage.get('family_id'))&&!await restoreChild())return;
   if(!child)return;
   const loadToday=async()=>{
    const keys=studyKeys(token,child),saved=storage.get(keys.resume),pending=storage.get(keys.pending);
    setResume(saved?.format===1&&(!studyComplete(saved)||saved.phase!=='summary'||pending)?saved:null);
    const book=storage.get(`current_wordbook:${child}`);return api(`/children/${child}/today${book?`?wordbook_id=${encodeURIComponent(book)}`:''}`);
   };
   let result;
   try{result=await loadToday();}catch(e){
    if(!isCurrent())return;
    if((e as Error).message==='WORDBOOK_NOT_FOUND'){storage.set(`current_wordbook:${child}`,'');key=contextKey();scope.current=key;setBookStats(null);setStatsStatus('loading');result=await loadToday();}
    else{
    if(!['CHILD_NOT_FOUND','FAMILY_NOT_FOUND'].includes((e as Error).message))throw e;
    if(!await restoreChild()||!child)return;result=await loadToday();
    }
   }
   if(isCurrent()){setToday(result);setError('');const book=storage.get(`current_wordbook:${child}`);void api(`/children/${child}/words?limit=1${book?`&wordbook_id=${encodeURIComponent(book)}`:''}`).then(data=>{if(!isCurrent())return;if(!Number.isInteger(data.learned_count)||!Number.isInteger(data.book_total)||data.learned_count<0||data.book_total<0||data.learned_count>data.book_total)throw Error('INVALID_BOOK_STATS');setBookStats({learned:data.learned_count,total:data.book_total});setStatsStatus('ready');}).catch(()=>{if(isCurrent()){setBookStats(null);setStatsStatus('unavailable');}});}
  }catch(error){if(isCurrent())setError(message(error));}finally{if(isCurrent())setLoading(false);}
 };
 useDidShow(()=>{void refresh();});useDidHide(()=>{serial.current++;});
 const enterInvitedFamily=async()=>{
  if(joiningFamily||!familyInvite||familyInvite.state!=='approved')return;
  const account=storage.get('access_token'),familyId=familyInvite.id,originalFamily=storage.get('family_id'),originalChild=storage.get('child_id'),current=serial.current;
  const isCurrent=()=>current===serial.current&&account===storage.get('access_token')&&originalFamily===storage.get('family_id')&&originalChild===storage.get('child_id');
  setJoiningFamily(true);
  try{const children=await api(`/families/${familyId}/children`);if(!isCurrent())return;selectFamilyContext(storage,familyId);reconcileFamilyChild(storage,children.items??[]);Taro.removeStorageSync('pending_family_invite');setFamilyInvite(null);await refresh();}
  catch(e){if(isCurrent())setError(message(e));}finally{setJoiningFamily(false);}
 };
 const launch=(source:StudySource,continuing=false)=>{storage.set('review_source',source);storage.set('study_intent',continuing?'resume':'start');setReviewing(true);};
 if(reviewing)return <ReviewSession onExit={()=>{setReviewing(false);void refresh();}}/>;
 const newAvailable=today?.new_count??0,newGroup=nextNewGroupSize(today),otherActive=!!today?.active_session&&!resume;
 const resumeNew=resume?.source.source==='new_words',resumeReview=!!resume&&!resumeNew,resumeRemaining=resume?Math.max(0,resume.total-studyCounts(resume).done):0;
 const selectedBook=storage.get(`current_wordbook:${storage.get('child_id')}`);
 const resumeOtherBook=!!resume&&!!selectedBook&&('wordbook_id' in resume.source?resume.source.wordbook_id!==selectedBook:true);
 const learn=()=>{if(resumeNew&&resume)return launch(resume.source,true);if(newAvailable)return launch({source:'new_words',...(selectedBook?{wordbook_id:selectedBook}:{})});return go('add-words');};
 const review=()=>{if(resumeReview&&resume)return launch(resume.source,true);if(today?.due_count)return launch({source:'review',...(selectedBook?{wordbook_id:selectedBook}:{})});};
 return <View className='page home-page'>
  <View className='home-toolbar'><View className='title home-title'>今天一起学</View><Button className='home-settings' onClick={()=>go('settings')}>设置<Chevron/></Button></View>
  {error&&<View className='error'>{error}<Button className='btn' disabled={loading} onClick={()=>void refresh()}>重新加载</Button></View>}
  {familyInvite&&<View className='notice home-family-invite'><View>{familyInvite.state==='waiting'?`已申请加入“${familyInvite.name}”，等待家人确认。`:familyInvite.state==='approved'?`已加入“${familyInvite.name}”。`:'家庭邀请已失效，请家人重新邀请。'}</View>{familyInvite.state==='approved'?<Button className='text-action' disabled={joiningFamily} onClick={()=>void enterInvitedFamily()}>{joiningFamily?'正在进入…':'进入家庭'}</Button>:familyInvite.state==='unavailable'?<Button className='text-action' onClick={()=>{Taro.removeStorageSync('pending_family_invite');setFamilyInvite(null);}}>知道了</Button>:null}</View>}
  <View className='card home-progress-card'>
   {loading&&!today?<View className='home-loading muted'>正在加载…</View>:today?<>
    <View className='home-card-header'><Text className='home-child-heading'>今日学习</Text><Text className='home-child-name'>{today.child.nickname}</Text></View>
    <Button className='home-current-book' onClick={()=>go('words')}><View className='home-book-copy'><View className='home-book-title'><Text className='home-book-label'>当前词本</Text><Text className='home-book-name'>{selectedBook?(today.wordbook?.name||'词本信息暂不可用'):'全部词本'}</Text></View><View className='home-book-stats'>{bookStats?`已学 ${bookStats.learned} 词 · 共 ${bookStats.total} 词`:statsStatus==='unavailable'?'词汇统计暂不可用':'正在加载词汇统计…'}</View></View><Chevron className='home-book-chevron'/></Button>
    <View className='home-progress-label'>今日累计</View><View className='progress'>{today.completed_words}<Text className='home-goal'> / {today.goal} 词</Text></View>
    <View className='home-goal-track'><View className='home-goal-value' style={{width:`${Math.min(100,today.completed_words*100/Math.max(1,today.goal))}%`}}/></View>
    <View className='home-learning-actions'>
     <Button className='home-study-button home-learn-button' disabled={loading||!!error||otherActive} onClick={learn}><Text className='home-action-title'>{resumeNew?'继续学习':'学习新词'}</Text><Text className='home-action-detail'>{resumeNew?`剩余 ${resumeRemaining} 词`:newGroup?`${today.goal_reached?'再学':'本轮'} ${newGroup} 词`:'添加单词'}</Text></Button>
     <Button className='home-study-button home-review-button' disabled={loading||!!error||otherActive||(!resumeReview&&!today.due_count)} onClick={review}><Text className='home-action-title'>{resumeReview?'继续复习':'复习单词'}</Text><Text className='home-action-detail'>{resumeReview?`剩余 ${resumeRemaining} 词`:today.due_count?`${Math.min(100,today.due_count)} 词待复习`:'今日无待复习'}</Text></Button>
    </View>
    {resumeOtherBook&&<View className='notice home-active-notice'>上次学习尚未完成，继续完成后可按当前词本学习。</View>}
    {otherActive&&<View className='notice home-active-notice'>已有学习进行中。<Button className='text-action' disabled={loading} onClick={()=>void refresh()}>刷新状态</Button></View>}
    <View className='home-shortcuts'><Button className='home-shortcut' onClick={()=>go('calendar')}>按日期复习<Chevron/></Button></View>
   </>:error?<View className='home-loading muted'>暂时无法加载学习进度。</View>:<><View className='home-welcome'>每天学一点。</View><View className='muted'>{storage.get('access_token')?'添加孩子后开始学习。':'登录后开始学习。'}</View><Button className='btn primary' onClick={()=>storage.get('access_token')?go('family'):void openLogin()}>{storage.get('access_token')?'添加孩子档案':'微信登录'}</Button></>}
  </View>
  {today&&<CheckinStatus key={`${storage.get('access_token')}:${today.child.id??storage.get('child_id')}`} today={{...today,date:checkinDate}} onShare={()=>void checkinShare.openShare()} onChanged={()=>void refresh()}/>}
  {checkinShare.content}
  {referralCode&&<Button className='text-action home-share' openType='share'>分享小程序</Button>}
 </View>;
}
