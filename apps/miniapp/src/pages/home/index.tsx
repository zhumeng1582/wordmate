import {CheckinStatus} from '../../components/CheckinStatus';
import {useCheckinShare} from '../../components/useCheckinShare';
import {Chevron} from '../../components/Chevron';
import {useRef,useState} from 'react';
import Taro,{useDidShow,useDidHide,useShareAppMessage} from '@tarojs/taro';
import {View,Text,Button} from '@tarojs/components';
import {api,storage,go,message,openLogin} from '../../services/api';
import {studyKeys,studyCounts,studyComplete,nextNewGroupSize,type StudyFlow,type StudySource} from '../../services/study-flow';
import {selectFamilyContext,reconcileFamilyChild} from '../../services/family-context';
import {familyInviteStatus,type FamilyInviteNotice} from '../../services/family-invite-status';
import {readHomeSections} from '../../services/home-sections';
import {waitForLibraryViews} from '../../services/library-checkin';
import './index.css';

type LibraryCheckin={total_days:number;checked_in:boolean};
function LibraryCard({kind,total,learned,checkin}:{kind:'poems'|'hanzi';total:number|null;learned:number|null;checkin:LibraryCheckin|null}){
 const poem=kind==='poems',title=poem?'古诗词':'汉字学习',unit=poem?'首':'字',learnedLabel=poem?'已背诵':'已学';
 const open=(status?:string)=>{void Taro.navigateTo({url:`/pages/${kind}/index${status?`?status=${status}`:''}`});};
 return <View className='card home-progress-card home-library-card'>
  <Button className='home-current-book' onClick={()=>open()}><Text className='home-word-heading'>{title}</Text><Text className='home-book-name'/><Text className='home-book-stats'>{total===null||learned===null?'统计加载中':`${learnedLabel} ${learned} ${unit} · 共 ${total} ${unit}`}</Text><Chevron className='home-book-chevron'/></Button>
  <View className='home-learning-actions'><Button className='home-study-button home-learn-button' onClick={()=>open(poem?'unmemorized':'unlearned')}><Text className='home-action-title'>{poem?'学习新诗':'学习新字'}</Text></Button><Button className='home-study-button home-review-button' onClick={()=>open(poem?'memorized':'learned')}><Text className='home-action-title'>{poem?'复习诗词':'复习汉字'}</Text></Button></View>
  <View className='home-checkin'><View className='home-checkin-row'><Text>{checkin?(checkin.checked_in?'✓ 今日已打卡':'今日未打卡'):'打卡状态暂不可用'}</Text><Text>{checkin?`累计 ${checkin.total_days} 天`:''}</Text></View></View>
 </View>;
}
export default function Home(){
 const [today,setToday]=useState<any>(null),[bookStats,setBookStats]=useState<{learned:number;total:number}|null>(null),[statsStatus,setStatsStatus]=useState<'loading'|'ready'|'unavailable'>('loading'),[resume,setResume]=useState<StudyFlow|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(()=>!!storage.get('access_token')),[referralCode,setReferralCode]=useState(''),[familyInvite,setFamilyInvite]=useState<FamilyInviteNotice|null>(null),[joiningFamily,setJoiningFamily]=useState(false);
 const [hanziStats,setHanziStats]=useState<{total:number;learned:number}|null>(null);
 const [libraryCheckins,setLibraryCheckins]=useState<{poems:LibraryCheckin;hanzi:LibraryCheckin}|null>(null);
 const [poemStats,setPoemStats]=useState<{total:number;memorized:number}|null>(null);
 const [sectionsVisible,setSectionsVisible]=useState(()=>readHomeSections(storage,String(storage.get('access_token')||'')));
 const checkinDate=today?.date??new Date(Date.now()+8*3600000).toISOString().slice(0,10),checkinShare=useCheckinShare(checkinDate);
 useShareAppMessage(()=>({title:'每天一点，记得更牢。和我一起学单词吧',path:`/pages/home/index${referralCode?`?ref=${encodeURIComponent(referralCode)}`:''}`}));
 const serial=useRef(0),scope=useRef('');
 const refresh=async()=>{
  const current=++serial.current,token=storage.get('access_token'),contextKey=()=>`${storage.get('access_token')}:${storage.get('child_id')}:${storage.get('family_id')}:${storage.get(`current_wordbook:${storage.get('child_id')}`)}`;
  let key=contextKey(),child=storage.get('child_id');const changed=scope.current!==key,isCurrent=()=>current===serial.current&&key===contextKey();
  if(changed){setLibraryCheckins(null);setHanziStats(null);setPoemStats(null);setReferralCode('');setFamilyInvite(null);setToday(null);setBookStats(null);setStatsStatus('loading');setResume(null);scope.current=key;}if(changed||!today)setError('');
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
   setToday(null);setLibraryCheckins(null);setHanziStats(null);setPoemStats(null);setBookStats(null);setStatsStatus('loading');setResume(null);return true;
  };
  const loadSections=()=>{void waitForLibraryViews().then(()=>api(`/children/${child}/library-checkins`)).then(data=>{if(isCurrent()&&data?.poems&&data?.hanzi)setLibraryCheckins(data);}).catch(()=>{if(isCurrent())setLibraryCheckins(null);});void api(`/children/${child}/hanzi`).then(data=>{if(isCurrent())setHanziStats(Number.isInteger(data.total)&&Number.isInteger(data.learned_count)?{total:data.total,learned:data.learned_count}:null);}).catch(()=>{if(isCurrent())setHanziStats(null);});void api(`/children/${child}/poems`).then(data=>{if(isCurrent())setPoemStats(Number.isInteger(data.total)&&Number.isInteger(data.memorized_count)&&data.total>=0&&data.memorized_count>=0&&data.memorized_count<=data.total?{total:data.total,memorized:data.memorized_count}:null);}).catch(()=>{if(isCurrent())setPoemStats(null);});const book=storage.get(`current_wordbook:${child}`);void api(`/children/${child}/words?limit=1${book?`&wordbook_id=${encodeURIComponent(book)}`:''}`).then(data=>{if(!isCurrent())return;if(!Number.isInteger(data.learned_count)||!Number.isInteger(data.book_total)||data.learned_count<0||data.book_total<0||data.learned_count>data.book_total)throw Error('INVALID_BOOK_STATS');setBookStats({learned:data.learned_count,total:data.book_total});setStatsStatus('ready');}).catch(()=>{if(isCurrent()){setBookStats(null);setStatsStatus('unavailable');}});};
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
   if(isCurrent()){setToday(result);setError('');loadSections();}
  }catch(error){if(isCurrent()){setError(message(error));if(child)loadSections();}}finally{if(isCurrent())setLoading(false);}
 };
 useDidShow(()=>{setSectionsVisible(readHomeSections(storage,String(storage.get('access_token')||'')));void refresh();});useDidHide(()=>{serial.current++;});
 const enterInvitedFamily=async()=>{
  if(joiningFamily||!familyInvite||familyInvite.state!=='approved')return;
  const account=storage.get('access_token'),familyId=familyInvite.id,originalFamily=storage.get('family_id'),originalChild=storage.get('child_id'),current=serial.current;
  const isCurrent=()=>current===serial.current&&account===storage.get('access_token')&&originalFamily===storage.get('family_id')&&originalChild===storage.get('child_id');
  setJoiningFamily(true);
  try{const children=await api(`/families/${familyId}/children`);if(!isCurrent())return;selectFamilyContext(storage,familyId);reconcileFamilyChild(storage,children.items??[]);Taro.removeStorageSync('pending_family_invite');setFamilyInvite(null);await refresh();}
  catch(e){if(isCurrent())setError(message(e));}finally{setJoiningFamily(false);}
 };
 const launch=(source:StudySource,continuing=false)=>{storage.set('review_source',source);storage.set('study_intent',continuing?'resume':'start');go('review');};
 const newAvailable=today?.new_count??0,newGroup=nextNewGroupSize(today),otherActive=!!today?.active_session&&!resume;
 const resumeNew=resume?.source.source==='new_words',resumeReview=!!resume&&!resumeNew,resumeRemaining=resume?Math.max(0,resume.total-studyCounts(resume).done):0;
 const selectedBook=storage.get(`current_wordbook:${storage.get('child_id')}`),showLibrary=!!today||(!loading&&!!error&&!!storage.get('access_token')&&!!storage.get('child_id'));
 const resumeOtherBook=!!resume&&!!selectedBook&&('wordbook_id' in resume.source?resume.source.wordbook_id!==selectedBook:true);
 const learn=()=>{if(resumeNew&&resume)return launch(resume.source,true);if(newAvailable)return launch({source:'new_words',...(selectedBook?{wordbook_id:selectedBook}:{})});return go('add-words');};
 const review=()=>{if(resumeReview&&resume)return launch(resume.source,true);if(today?.due_count)return launch({source:'review',...(selectedBook?{wordbook_id:selectedBook}:{})});};
 const chooseReview=async()=>{const owner=`${storage.get('access_token')}:${storage.get('child_id')}`,available=!!resumeReview||!!today?.due_count;try{const result=await Taro.showActionSheet({itemList:available?[resumeReview?'继续上次复习':'开始复习','按日期复习']:['按日期复习']});if(owner!==`${storage.get('access_token')}:${storage.get('child_id')}`)return;if(available&&result.tapIndex===0)review();else if(result.tapIndex===(available?1:0))go('calendar');}catch(e:any){if(!/cancel/i.test(String(e?.errMsg??e?.message??'')))setError(message(e));}};
 return <View className='page home-page'>
  <View className='home-toolbar'><View className='title home-title'>{today?.child?.nickname?`${today.child.nickname}，今天一起学`:'今天一起学'}</View><Button className='home-settings' onClick={()=>go('settings')}>设置</Button></View>
  {error&&<View className='error'>{error}<Button className='btn' disabled={loading} onClick={()=>void refresh()}>重新加载</Button></View>}
  {familyInvite&&<View className='notice home-family-invite'><View>{familyInvite.state==='waiting'?`已申请加入“${familyInvite.name}”，等待家人确认。`:familyInvite.state==='approved'?`已加入“${familyInvite.name}”。`:'家庭邀请已失效，请家人重新邀请。'}</View>{familyInvite.state==='approved'?<Button className='text-action' disabled={joiningFamily} onClick={()=>void enterInvitedFamily()}>{joiningFamily?'正在进入…':'进入家庭'}</Button>:familyInvite.state==='unavailable'?<Button className='text-action' onClick={()=>{Taro.removeStorageSync('pending_family_invite');setFamilyInvite(null);}}>知道了</Button>:null}</View>}
  {(!today||sectionsVisible.words)&&<View className='card home-progress-card'>
   {loading&&!today?<View className='home-loading muted'>正在加载…</View>:today?<>
    <Button className='home-current-book' onClick={()=>go('words')}><Text className='home-word-heading'>英语单词</Text><Text className='home-book-name'>{selectedBook?(today.wordbook?.name||'词本信息暂不可用'):'全部词本'}</Text><Text className='home-book-stats'>{bookStats?`已学 ${bookStats.learned} · 共 ${bookStats.total}`:statsStatus==='unavailable'?'统计暂不可用':'统计加载中'}</Text><Chevron className='home-book-chevron'/></Button>
    <View className='home-progress-summary'><Text className='home-progress-label'>今日累计</Text><View className='progress'>{today.completed_words}<Text className='home-goal'> / {today.goal} 词</Text></View></View>
    <View className='home-learning-actions'><Button className='home-study-button home-learn-button' disabled={loading||!!error||otherActive} onClick={learn}><Text className='home-action-title'>{resumeNew?'继续学习':'学习新词'}</Text><Text className='home-action-detail'>{resumeNew?`剩余 ${resumeRemaining} 词`:newGroup?`${today.goal_reached?'再学':'本轮'} ${newGroup} 词`:'添加单词'}</Text></Button><Button className='home-study-button home-review-button' disabled={loading||!!error||otherActive} onClick={()=>void chooseReview()}><Text className='home-action-title'>{resumeReview?'继续复习':'复习单词'}</Text><Text className='home-action-detail'>{resumeReview?`剩余 ${resumeRemaining} 词`:today.due_count?`${Math.min(100,today.due_count)} 词待复习`:'按日期复习'}</Text></Button></View>
    {resumeOtherBook&&<View className='notice home-active-notice'>上次学习尚未完成，继续完成后可按当前词本学习。</View>}{otherActive&&<View className='notice home-active-notice'>已有学习进行中。<Button className='text-action' disabled={loading} onClick={()=>void refresh()}>刷新状态</Button></View>}
    <CheckinStatus key={`${storage.get('access_token')}:${today.child.id??storage.get('child_id')}`} today={{...today,date:checkinDate}} onShare={()=>void checkinShare.openShare()} onChanged={()=>void refresh()}/>
   </>:error?<View className='home-loading muted'>暂时无法加载学习进度。</View>:<><View className='home-welcome'>每天学一点。</View><View className='muted'>{storage.get('access_token')?'添加孩子后开始学习。':'登录后开始学习。'}</View><Button className='btn primary' onClick={()=>storage.get('access_token')?go('family'):void openLogin()}>{storage.get('access_token')?'添加孩子档案':'微信登录'}</Button></>}
  </View>}
  {showLibrary&&sectionsVisible.poems&&<LibraryCard kind='poems' total={poemStats?.total??null} learned={poemStats?.memorized??null} checkin={libraryCheckins?.poems??null}/>}
  {showLibrary&&sectionsVisible.hanzi&&<LibraryCard kind='hanzi' total={hanziStats?.total??null} learned={hanziStats?.learned??null} checkin={libraryCheckins?.hanzi??null}/>}
  {sectionsVisible.words&&checkinShare.content}{referralCode&&<Button className='text-action home-share' openType='share'>分享小程序</Button>}
 </View>;
}
