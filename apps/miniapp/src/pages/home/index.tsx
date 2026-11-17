import {HomeContentPlaceholder} from '../../components/HomeContentPlaceholder';
import {homeEmptyState,type HomeBook} from '../../services/home-content';
import {SentenceHomeCard} from '../../components/SentenceHomeCard';
import {Icon} from '../../components/Icon';
import {CheckinStatus} from '../../components/CheckinStatus';
import {useCheckinShare} from '../../components/useCheckinShare';
import {Chevron} from '../../components/Chevron';
import {useRef,useState} from 'react';
import Taro,{useDidShow,useDidHide,useShareAppMessage} from '@tarojs/taro';
import {View,Text,Button} from '@tarojs/components';
import {api,storage,go,message,openLogin} from '../../services/api';
import {studyKeys,studyComplete,nextNewGroupSize,nextReviewGroupSize,studyResumeDetail,type StudyFlow,type StudySource} from '../../services/study-flow';
import {selectFamilyContext,reconcileFamilyChild} from '../../services/family-context';
import {familyInviteStatus,type FamilyInviteNotice} from '../../services/family-invite-status';
import {readHomeSections,readHomeSectionOrder} from '../../services/home-sections';
import {waitForLibraryViews} from '../../services/library-checkin';
import './index.css';

type LibraryCheckin={total_days:number;checked_in:boolean};
type HomeAction={title:string;detail:string;disabled?:boolean;onClick:()=>void};
function LearningCard({kind,bookName,stats,statsStatus,progress,learn,review,onOpen,onRetry,error,children,canReview=true}:{kind:'words'|'hanzi';bookName:string;stats:{learned:number;total:number}|null;statsStatus:'loading'|'ready'|'unavailable';progress:{completed:number;goal:number}|null;learn:HomeAction;review:HomeAction;onOpen:()=>void;onRetry?:()=>void;error?:string;children?:any;canReview?:boolean}){
 const unit=kind==='hanzi'?'字':'词',title=kind==='hanzi'?'汉字学习':'英语单词';
 return <View className='card home-progress-card' data-kind={kind}><Button className='home-current-book' onClick={onOpen}><Text className='home-word-heading'>{title}</Text><Text className='home-book-name'>{bookName}</Text><Text className='home-book-stats'>{stats?`已学 ${stats.learned} · 共 ${stats.total}`:statsStatus==='unavailable'?'统计暂不可用':'统计加载中'}</Text><Chevron className='home-book-chevron'/></Button><View className='home-progress-summary'><Text className='home-progress-label'>今日累计</Text><View className='progress'>{progress?<>{progress.completed}<Text className='home-goal'> / {progress.goal} {unit}</Text></>:<Text className='home-goal'>进度暂不可用</Text>}</View></View><View className={`home-learning-actions ${canReview?'':'home-learning-actions-single'}`}>{[learn,...(canReview?[review]:[])].map((action,index)=><Button key={index} className={`home-study-button ${index?'home-review-button':'home-learn-button'}`} disabled={action.disabled} onClick={action.onClick}><Text className='home-action-title'>{action.title}</Text><Text className='home-action-detail'>{action.detail}</Text></Button>)}</View>{error&&<View className='error'>{error}{onRetry&&<Button className='text-action' onClick={onRetry}>重新加载</Button>}</View>}{children}</View>;
}
function LibraryCard({total,learned,checkin,bookName,error,onRetry}:{kind:'poems';total:number|null;learned:number|null;checkin:LibraryCheckin|null;bookName:string;error?:string;onRetry:()=>void}){
 const open=(status?:string)=>void Taro.navigateTo({url:`/pages/poems/index${status?`?status=${status}`:''}`});
 return <View className='card home-progress-card home-library-card' data-kind='poems'><Button className='home-current-book' onClick={()=>open()}><Text className='home-word-heading'>古诗词</Text><Text className='home-book-name'>{bookName||(error?'诗本暂不可用':'诗本加载中')}</Text><Text className='home-book-stats'>{total===null||learned===null?(error?'统计暂不可用':'统计加载中'):`已学 ${learned} 首 · 共 ${total} 首`}</Text><Chevron className='home-book-chevron'/></Button><View className={`home-learning-actions ${learned?'':'home-learning-actions-single'}`}><Button className='home-study-button home-learn-button' onClick={()=>open('unlearned')}><Text className='home-action-title'>学习新诗</Text></Button>{!!learned&&<Button className='home-study-button home-review-button' onClick={()=>open('learned')}><Text className='home-action-title'>复习诗词</Text></Button>}</View>{error&&<View className='error'>{error}<Button className='text-action' onClick={onRetry}>重新加载</Button></View>}<View className='home-checkin'><View className='home-checkin-row'><Text>{checkin?(checkin.checked_in?'✓ 今日已打卡':'今日未打卡'):'打卡状态暂不可用'}</Text><Text>{checkin?`累计 ${checkin.total_days} 天`:''}</Text></View></View></View>;
}
export default function Home(){
 const [today,setToday]=useState<any>(null),[bookStats,setBookStats]=useState<{learned:number;total:number}|null>(null),[statsStatus,setStatsStatus]=useState<'loading'|'ready'|'unavailable'>('loading'),[resume,setResume]=useState<StudyFlow|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(()=>!!storage.get('access_token')),[referralCode,setReferralCode]=useState(''),[familyInvite,setFamilyInvite]=useState<FamilyInviteNotice|null>(null),[joiningFamily,setJoiningFamily]=useState(false);
 const [hanziRound,setHanziRound]=useState<any>(null),[hanziLoading,setHanziLoading]=useState(true),[hanziError,setHanziError]=useState('');
 const [hanziBookName,setHanziBookName]=useState('');
 const [hanziStats,setHanziStats]=useState<{total:number;learned:number}|null>(null);
 const [hanziProgress,setHanziProgress]=useState<{completed:number;goal:number;checked_in:boolean;total_days?:number;new_count?:number;due_count?:number}|null>(null);
 const [libraryCheckins,setLibraryCheckins]=useState<{poems:LibraryCheckin;hanzi:LibraryCheckin}|null>(null);
 const [poemBookName,setPoemBookName]=useState(''),[poemError,setPoemError]=useState('');
 const [poemStats,setPoemStats]=useState<{total:number;memorized:number}|null>(null);
 const [sectionsVisible,setSectionsVisible]=useState(()=>readHomeSections(storage,String(storage.get('access_token')||'')));
 const [sectionOrder,setSectionOrder]=useState(()=>readHomeSectionOrder(storage,String(storage.get('access_token')||'')));
 const checkinDate=today?.date??new Date(Date.now()+8*3600000).toISOString().slice(0,10),checkinShare=useCheckinShare(checkinDate),hanziShare=useCheckinShare((hanziProgress as any)?.date??checkinDate,'hanzi');
 useShareAppMessage(()=>({title:'每天一点，记得更牢。和我一起学单词吧',path:`/pages/home/index${referralCode?`?ref=${encodeURIComponent(referralCode)}`:''}`}));
 const serial=useRef(0),scope=useRef('');
 const [homeBooks,setHomeBooks]=useState<{words:HomeBook[];hanzi:HomeBook[];poems:HomeBook[]}>({words:[],hanzi:[],poems:[]}),[sentenceEmpty,setSentenceEmpty]=useState<boolean|null>(null);
 const refresh=async()=>{
  const current=++serial.current,token=storage.get('access_token'),contextKey=()=>`${storage.get('access_token')}:${storage.get('child_id')}:${storage.get('family_id')}:${storage.get(`current_wordbook:${storage.get('child_id')}`)}:${storage.get(`current_hanzi_book:${storage.get('child_id')}`)}:${storage.get(`current_poem_book:${storage.get('child_id')}`)}`;
  let key=contextKey(),child=storage.get('child_id');const changed=scope.current!==key,isCurrent=()=>current===serial.current&&key===contextKey();
  if(changed){setHomeBooks({words:[],hanzi:[],poems:[]});setSentenceEmpty(null);setHanziLoading(true);setLibraryCheckins(null);setHanziStats(null);setHanziBookName('');setHanziProgress(null);setHanziRound(null);setPoemStats(null);setPoemBookName('');setPoemError('');setReferralCode('');setFamilyInvite(null);setToday(null);setBookStats(null);setStatsStatus('loading');setResume(null);scope.current=key;}if(changed||!today)setError('');
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
   setHomeBooks({words:[],hanzi:[],poems:[]});setSentenceEmpty(null);setToday(null);setHanziLoading(true);setLibraryCheckins(null);setHanziStats(null);setHanziBookName('');setHanziProgress(null);setHanziRound(null);setPoemStats(null);setPoemBookName('');setPoemError('');setBookStats(null);setStatsStatus('loading');setResume(null);return true;
  };
  // Returning to the same book refreshes in the background without toggling button colors.
  const loadSections=()=>{if(changed||!hanziProgress)setHanziLoading(true);setHanziError('');void (async()=>{
   const data=await api(`/children/${child}/hanzi-books`);if(!isCurrent())return;
   if(!Array.isArray(data.items))throw Error('INVALID_HANZI_BOOKS');setHomeBooks(old=>({...old,hanzi:data.items}));
   const saved=storage.get(`current_hanzi_book:${child}`),book=data.items.find((b:any)=>b.id===saved)??data.items[0];
   if((book?.id??'')!==(saved||'')){setHanziLoading(true);setHanziStats(null);setHanziProgress(null);setHanziRound(null);}
   storage.set(`current_hanzi_book:${child}`,book?.id??'');storage.set(`current_hanzi_book_name:${child}`,book?.name??'');key=contextKey();scope.current=key;setHanziBookName(book?.name??'');
   if(!book){setHanziStats({total:0,learned:0});setHanziProgress(null);setHanziRound(null);return;}
   const suffix=`?book_id=${encodeURIComponent(book.id)}`,[progress,stats,active]=await Promise.all([api(`/children/${child}/hanzi-progress${suffix}`),api(`/children/${child}/hanzi${suffix}`),api(`/children/${child}/hanzi-study-rounds`).catch(()=>({round:null}))]);if(!isCurrent())return;
   setHanziRound(active.round?.status==='in_progress'?active.round:null);setHanziProgress(Number.isInteger(progress.completed)&&Number.isInteger(progress.goal)&&typeof progress.checked_in==='boolean'?progress:null);const total=stats.overall_total??stats.total,learned=stats.overall_learned_count??stats.learned_count;setHanziStats(Number.isInteger(total)&&Number.isInteger(learned)&&total>=0&&learned>=0&&learned<=total?{total,learned}:null);
  })().catch(e=>{if(isCurrent()){setHanziStats(null);setHanziProgress(null);setHanziRound(null);setHanziError(message(e));}}).finally(()=>{if(isCurrent())setHanziLoading(false);});void waitForLibraryViews().then(()=>api(`/children/${child}/library-checkins`)).then(data=>{if(isCurrent()&&data?.poems&&data?.hanzi)setLibraryCheckins(data);}).catch(()=>{if(isCurrent())setLibraryCheckins(null);});setPoemError('');void (async()=>{
   const books=await api(`/children/${child}/poem-books`);if(!isCurrent())return;
   if(!Array.isArray(books.items))throw Error('诗本列表暂时无法加载，请重试。');setHomeBooks(old=>({...old,poems:books.items}));
   const saved=storage.get(`current_poem_book:${child}`),book=books.items.find((b:any)=>b.id===saved)??books.items[0];
   if((book?.id??'')!==(saved||''))setPoemStats(null);
   storage.set(`current_poem_book:${child}`,book?.id??'');key=contextKey();scope.current=key;setPoemBookName(book?.name??'');
   if(!book){setPoemStats({total:0,memorized:0});return;}
   const data=await api(`/children/${child}/poems?book_id=${encodeURIComponent(book.id)}`);if(!isCurrent())return;
   const total=data.overall_total??data.total,learned=data.overall_learned_count??data.memorized_count;
   if(!Number.isInteger(total)||!Number.isInteger(learned)||total<0||learned<0||learned>total)throw Error('诗本统计暂时不可用，请重试。');
   setPoemStats({total,memorized:learned});
  })().catch(e=>{if(isCurrent()){setPoemStats(null);setPoemError(message(e));}});const book=storage.get(`current_wordbook:${child}`);void api(`/children/${child}/words?limit=1${book?`&wordbook_id=${encodeURIComponent(book)}`:''}`).then(async data=>{if(!isCurrent())return;const learned=data.overall_learned_count??data.learned_count,total=data.overall_total??data.book_total;if(!Number.isInteger(learned)||!Number.isInteger(total)||learned<0||total<0||learned>total)throw Error('INVALID_BOOK_STATS');if(total===0){const books=await api(`/children/${child}/wordbooks`);if(!isCurrent())return;if(!Array.isArray(books.items))throw Error('INVALID_WORDBOOKS');setHomeBooks(old=>({...old,words:books.items}));}setBookStats({learned,total});setStatsStatus('ready');}).catch(()=>{if(isCurrent()){setBookStats(null);setStatsStatus('unavailable');}});};
  try{
   if((!child||!storage.get('family_id'))&&!await restoreChild())return;
   if(!child)return;
   const loadToday=async()=>{
    const keys=studyKeys(token,child),saved=storage.get(keys.resume),pending=storage.get(keys.pending);
    setResume(saved?.format===1&&(!studyComplete(saved)||saved.phase!=='summary'||pending)?saved:null);
    let book=storage.get(`current_wordbook:${child}`);
    if(!book){
     const data=await api(`/children/${child}/wordbooks`);if(!isCurrent())return;
     if(!Array.isArray(data.items))throw Error('INVALID_WORDBOOKS');
     book=data.items[0]?.id??'';storage.set(`current_wordbook:${child}`,book);key=contextKey();scope.current=key;
    }
    return api(`/children/${child}/today${book?`?wordbook_id=${encodeURIComponent(book)}`:''}`);
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
  }catch(error){if(current===serial.current&&token&&!storage.get('access_token')){scope.current='';setToday(null);setResume(null);setFamilyInvite(null);setReferralCode('');setBookStats(null);setHanziStats(null);setHanziProgress(null);setPoemStats(null);setLibraryCheckins(null);setError('');}else if(isCurrent()){setError(message(error));if(child)loadSections();}}finally{if(isCurrent()||current===serial.current&&!storage.get('access_token'))setLoading(false);}
 };
 useDidShow(()=>{setSectionOrder(readHomeSectionOrder(storage,String(storage.get('access_token')||'')));setSectionsVisible(readHomeSections(storage,String(storage.get('access_token')||'')));void refresh();});useDidHide(()=>{serial.current++;});
 const enterInvitedFamily=async()=>{
  if(joiningFamily||!familyInvite||familyInvite.state!=='approved')return;
  const account=storage.get('access_token'),familyId=familyInvite.id,originalFamily=storage.get('family_id'),originalChild=storage.get('child_id'),current=serial.current;
  const isCurrent=()=>current===serial.current&&account===storage.get('access_token')&&originalFamily===storage.get('family_id')&&originalChild===storage.get('child_id');
  setJoiningFamily(true);
  try{const children=await api(`/families/${familyId}/children`);if(!isCurrent())return;selectFamilyContext(storage,familyId);reconcileFamilyChild(storage,children.items??[]);Taro.removeStorageSync('pending_family_invite');setFamilyInvite(null);await refresh();}
  catch(e){if(isCurrent())setError(message(e));}finally{setJoiningFamily(false);}
 };
 const launch=(source:StudySource,continuing=false)=>{storage.set('review_source',source);storage.set('study_intent',continuing?'resume':'start');go('review');};
 const newGroup=nextNewGroupSize(today),otherActive=!!today?.active_session&&!resume;
 const selectedBook=storage.get(`current_wordbook:${storage.get('child_id')}`),showLibrary=!!today||(!loading&&!!error&&!!storage.get('access_token')&&!!storage.get('child_id'));
 const resumeSameBook=!!selectedBook&&!!resume&&('wordbook_id' in resume.source?resume.source.wordbook_id??'':'')===selectedBook;
 const resumeNew=resumeSameBook&&resume?.source.source==='new_words',resumeReview=resumeSameBook&&!!resume&&!resumeNew;
 const resumeOtherBook=!!resume&&!resumeSameBook;
 const learn=()=>{if(resumeNew&&resume)return launch(resume.source,true);if(selectedBook)return launch({source:'new_words',wordbook_id:selectedBook});};
 const review=()=>{if(resumeReview&&resume)return launch(resume.source,true);if(selectedBook&&today?.due_count)return launch({source:'review',wordbook_id:selectedBook});};
 const chooseReview=()=>{if(resumeReview||today?.due_count)review();else go('calendar');};
 const hanziBook=storage.get(`current_hanzi_book:${storage.get('child_id')}`),characterProgress=hanziProgress as any;
 const hanziSame=!!hanziBook&&hanziRound?.book_id===hanziBook,hanziResumeNew=hanziSame&&hanziRound.source==='new',hanziResumeReview=hanziSame&&!hanziResumeNew,hanziRemaining=hanziRound?Math.max(0,hanziRound.total_count-hanziRound.answered_count):0,hanziGroup=nextNewGroupSize({new_count:characterProgress?.new_count,goal:characterProgress?.goal},100);
 const openHanzi=(source:string,count?:number)=>void Taro.navigateTo({url:`/pages/hanzi-study/index?source=${source}${count?`&count=${count}`:''}`});
 const learnHanzi=()=>{if(hanziResumeNew)return openHanzi('new');return openHanzi('new',hanziGroup);};
 const reviewHanzi=()=>{if(hanziResumeReview)return openHanzi(hanziRound.source);if(hanziBook&&characterProgress?.due_count)return openHanzi('review',Math.min(100,characterProgress.due_count));};
 const chooseHanziReview=async()=>{const key=`${storage.get('access_token')}:${storage.get('child_id')}:${storage.get(`current_hanzi_book:${storage.get('child_id')}`)}`,available=hanziResumeReview||!!characterProgress?.due_count;try{const r=await Taro.showActionSheet({itemList:available?[hanziResumeReview?'继续上次复习':'曲线复习','按日期复习']:['按日期复习']});if(key!==`${storage.get('access_token')}:${storage.get('child_id')}:${storage.get(`current_hanzi_book:${storage.get('child_id')}`)}`)return;if(available&&r.tapIndex===0)reviewHanzi();else if(r.tapIndex===(available?1:0))void Taro.navigateTo({url:'/pages/calendar/index?kind=hanzi'});}catch(e:any){if(!/cancel/i.test(String(e?.errMsg??e?.message??'')))setHanziError(message(e));}};
 const poemBook=String(storage.get(`current_poem_book:${storage.get('child_id')}`)||'');
 const empties={words:homeEmptyState('words',bookStats?.total??null,homeBooks.words,selectedBook),hanzi:homeEmptyState('hanzi',hanziStats?.total??null,homeBooks.hanzi,hanziBook),poems:homeEmptyState('poems',poemStats?.total??null,homeBooks.poems,poemBook)};
 const firstContent=showLibrary&&!error&&sectionOrder.filter(kind=>sectionsVisible[kind]).every(kind=>kind==='sentences'?sentenceEmpty===true:empties[kind]==='empty');
 const viewGeneration=serial.current,viewOwner=`${storage.get('access_token')}:${storage.get('child_id')}:${storage.get('family_id')}`;
 const switchHomeBook=(kind:'words'|'hanzi'|'poems',id:string)=>{if(viewGeneration!==serial.current||viewOwner!==`${storage.get('access_token')}:${storage.get('child_id')}:${storage.get('family_id')}`)return;if(!homeBooks[kind].some(book=>book.id===id))return;const prefix={words:'current_wordbook',hanzi:'current_hanzi_book',poems:'current_poem_book'}[kind];storage.set(`${prefix}:${storage.get('child_id')}`,id);void refresh();};
 return <View className='page home-page'>
  <View className='home-toolbar'><View className='title home-title'>{today?.child?.nickname?`${today.child.nickname}，今天一起学`:'今天一起学'}</View><View className='home-toolbar-actions'><Button className='home-icon-button' aria-label='搜索' hoverClass='home-icon-hover' onClick={()=>go('search')}><Icon name='search' size='lg'/></Button><Button className='home-icon-button' aria-label='设置' hoverClass='home-icon-hover' onClick={()=>go('settings')}><Icon name='settings' size='lg'/></Button></View></View>
  {error&&<View className='error'>{error}<Button className='btn' disabled={loading} onClick={()=>void refresh()}>重新加载</Button></View>}
  {familyInvite&&<View className='notice home-family-invite'><View>{familyInvite.state==='waiting'?`已申请加入“${familyInvite.name}”，等待家人确认。`:familyInvite.state==='approved'?`已加入“${familyInvite.name}”。`:'家庭邀请已失效，请家人重新邀请。'}</View>{familyInvite.state==='approved'?<Button className='text-action' disabled={joiningFamily} onClick={()=>void enterInvitedFamily()}>{joiningFamily?'正在进入…':'进入家庭'}</Button>:familyInvite.state==='unavailable'?<Button className='text-action' onClick={()=>{Taro.removeStorageSync('pending_family_invite');setFamilyInvite(null);}}>知道了</Button>:null}</View>}
  {firstContent&&<View className='home-first-content-hint'>先添加一些内容，就能开始学习。</View>}
  {sectionOrder.map(kind=>{
   if(kind==='sentences')return showLibrary&&sectionsVisible.sentences?<SentenceHomeCard key='sentences' data-kind='sentences' onEmptyChange={setSentenceEmpty}/>:null;
   if(showLibrary&&sectionsVisible[kind]&&(kind!=='words'||today)){
    const stats=kind==='words'?bookStats:kind==='hanzi'?hanziStats:poemStats,problem=kind==='words'?(statsStatus==='unavailable'?'单词统计暂时无法加载。':''):kind==='hanzi'?hanziError:poemError;
    if(!stats||problem||empties[kind])return <HomeContentPlaceholder key={kind} kind={kind} state={problem?'error':!stats?(kind==='hanzi'&&!hanziLoading?'error':'loading'):empties[kind]!} error={problem} bookName={kind==='words'?today?.wordbook?.name:kind==='hanzi'?hanziBookName:poemBookName} books={homeBooks[kind]} bookId={kind==='words'?selectedBook:kind==='hanzi'?hanziBook:poemBook} onSwitch={id=>switchHomeBook(kind,id)} onRetry={()=>void refresh()}/>;
   }
   if(kind==='words')return ((!today||sectionsVisible.words)&&(today?<LearningCard key='words' kind='words' canReview={!!bookStats?.learned||!!today.due_count||!!resumeReview||!!today.completed_words} bookName={selectedBook?(today.wordbook?.name||'词本信息暂不可用'):'暂无词本'} stats={bookStats} statsStatus={statsStatus} progress={{completed:today.completed_words,goal:today.goal}} onOpen={()=>go('words')} learn={{title:resumeNew?'继续学习':'学习新词',detail:resumeNew?studyResumeDetail(resume!):newGroup?`${today.goal_reached?'再学':'本轮'} ${newGroup} 词`:'暂无未学单词',disabled:loading||!!error||otherActive||!selectedBook,onClick:learn}} review={{title:resumeReview?'继续复习':'复习单词',detail:resumeReview?studyResumeDetail(resume!):today.due_count?`待复习 ${today.due_count} 词 · 本轮 ${nextReviewGroupSize(today)} 词`:'按日期复习',disabled:loading||!!error||otherActive,onClick:()=>void chooseReview()}}>
    {resumeOtherBook&&<View className='notice home-active-notice'>上次有其他范围的学习未完成。开始当前词本时可选择结束上次学习，已保存的进度会保留。</View>}{otherActive&&<View className='notice home-active-notice'>已有学习进行中。<Button className='text-action' disabled={loading} onClick={()=>void refresh()}>刷新状态</Button></View>}
    {!!today.due_count&&<View className='home-review-context'><Text>可以先复习，再认识新词</Text><Button className='text-action' onClick={()=>go('calendar')}>按日期复习<Chevron/></Button></View>}
    <CheckinStatus key={`${storage.get('access_token')}:${today.child.id??storage.get('child_id')}:words`} today={{...today,date:checkinDate}} onShare={()=>void checkinShare.openShare()} onChanged={()=>void refresh()}/>
   </LearningCard>:<View key='words' className='card home-progress-card'>{loading?<View className='home-loading muted'>正在加载…</View>:error?<View className='home-loading muted'>暂时无法加载学习进度。</View>:<><View className='home-welcome'>每天学一点。</View><View className='muted'>{storage.get('access_token')?'添加孩子后开始学习。':'登录后开始学习。'}</View><Button className='btn primary' onClick={()=>storage.get('access_token')?go('family'):void openLogin()}>{storage.get('access_token')?'添加孩子档案':'微信登录'}</Button></>}</View>));
   if(kind==='poems')return (showLibrary&&sectionsVisible.poems&&<LibraryCard key='poems' kind='poems' bookName={poemBookName} error={poemError} onRetry={()=>void refresh()} total={poemStats?.total??null} learned={poemStats?.memorized??null} checkin={libraryCheckins?.poems??null}/>);
   return (showLibrary&&sectionsVisible.hanzi&&<LearningCard key='hanzi' kind='hanzi' canReview={!!hanziStats?.learned||!!characterProgress?.due_count||!!hanziResumeReview||!!characterProgress?.completed} bookName={hanziBookName||(hanziLoading?'正在读取字本…':'暂无字本')} stats={hanziStats} statsStatus={hanziLoading?'loading':hanziStats?'ready':'unavailable'} progress={hanziProgress} error={hanziError} onRetry={()=>void refresh()} onOpen={()=>void Taro.navigateTo({url:'/pages/hanzi/index'})} learn={{title:hanziResumeNew?'继续学习':'学习新字',detail:hanziResumeNew?`剩余 ${hanziRemaining} 字`:hanziGroup?`${characterProgress?.checked_in?'再学':'本轮'} ${hanziGroup} 字`:'暂无未学汉字',disabled:hanziLoading||!!hanziError||!hanziProgress,onClick:learnHanzi}} review={{title:hanziResumeReview?'继续复习':'复习汉字',detail:hanziResumeReview?`剩余 ${hanziRemaining} 字`:characterProgress?.due_count?`${Math.min(100,characterProgress.due_count)} 字待复习`:'按日期复习',disabled:hanziLoading||!!hanziError||!hanziProgress,onClick:()=>void chooseHanziReview()}}>
   {hanziRound&&!hanziSame&&<View className='notice home-active-notice'>上次有其他范围的学习未完成。开始当前字本时可选择结束上次学习，已保存的进度会保留。</View>}
   {characterProgress?<CheckinStatus key={`${storage.get('access_token')}:${storage.get('child_id')}:hanzi`} kind='hanzi' today={{...characterProgress,completed_words:characterProgress.completed,total_checkin_days:characterProgress.total_days}} onShare={()=>void hanziShare.openShare()} onChanged={()=>void refresh()}/>:<View className='home-checkin'>汉字进度暂不可用</View>}
  </LearningCard>);
  })}
  {sectionsVisible.words&&checkinShare.content}{sectionsVisible.hanzi&&hanziShare.content}{referralCode&&<Button className='text-action home-share' openType='share'>分享小程序</Button>}
 </View>;
}
