import {useEffect,useRef,useState} from 'react';
import Taro,{useLoad,useDidShow,useDidHide} from '@tarojs/taro';
import {View,Button} from '@tarojs/components';
import {api,storage,openLogin,eventId,message} from '../../services/api';
import {selectFamilyContext,reconcileFamilyChild} from '../../services/family-context';
import {beginInviteLogin,consumeInviteLogin,cancelInviteLogin} from '../../services/invite-login';
import './index.css';
type Destination={state:'ready'|'waiting'|'member'|'unavailable';family?:{id:string;name:string};children?:{id:string}[];expires_at?:string};
type Screen='checking'|'login'|'ready'|'waiting'|'unavailable'|'error';
export default function Invite(){
 const [screen,setScreen]=useState<Screen>('checking'),[familyName,setFamilyName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const token=useRef(''),shown=useRef(true),serial=useRef(0),locked=useRef(false),loginOpening=useRef(false),loginOpened=useRef(false),loginFlow=useRef(''),claimKey=useRef(eventId()),lastScreen=useRef<Screen>('checking');
 const show=(next:Screen)=>{lastScreen.current=next;setScreen(next);};
 const home=()=>Taro.reLaunch({url:'/pages/home/index'});
 const startLogin=async()=>{
  if(loginOpening.current)return;loginOpening.current=true;const id=eventId();loginOpened.current=true;loginFlow.current=id;beginInviteLogin(id);show('login');setError('');
  try{await openLogin('dev-mom',id);}catch(e){cancelInviteLogin(id);loginFlow.current='';if(shown.current)setError(message(e));}finally{loginOpening.current=false;}
 };
 const check=async(join=false)=>{
  if(locked.current||!shown.current||!token.current)return;
  const account=storage.get('access_token');if(!account){show('login');if(!loginOpened.current)await startLogin();return;}
  const ticket=++serial.current;locked.current=true;setBusy(true);setError('');const current=()=>shown.current&&ticket===serial.current&&account===storage.get('access_token');
  const display=async(result:Destination)=>{
   if(!current())return;
   if(result.state==='member'&&result.family){selectFamilyContext(storage,result.family.id);reconcileFamilyChild(storage,result.children??[]);await home();return;}
   setFamilyName(result.family?.name??'');show(result.state==='member'?'error':result.state);
  };
  try{
   let result=await api<Destination>('/family-invites/resolve','POST',{invite_token:token.current});if(!current())return;
   if(join&&result.state==='ready'){
    try{await api('/family-invites/claim','POST',{invite_token:token.current},claimKey.current);}catch(e){
     if(!current())return;const recovered=await api<Destination>('/family-invites/resolve','POST',{invite_token:token.current});if(recovered.state==='ready')throw e;await display(recovered);return;
    }
    if(!current())return;result=await api<Destination>('/family-invites/resolve','POST',{invite_token:token.current});
   }
   await display(result);
  }catch(e){if(!shown.current||ticket!==serial.current)return;if(account!==storage.get('access_token')){show('login');if(!storage.get('access_token')&&!loginOpened.current)await startLogin();return;}setError(message(e));if(!['ready','waiting'].includes(lastScreen.current))show('error');}
  finally{if(ticket===serial.current){locked.current=false;setBusy(false);}}
 };
 useLoad(query=>{const incoming=query.token??'';if(/^[A-Za-z0-9_-]{43}$/.test(incoming))token.current=incoming;else show('unavailable');});
 useDidShow(()=>{shown.current=true;const join=consumeInviteLogin(loginFlow.current,storage.get('access_token'));loginFlow.current='';if(token.current)void check(join);});
 useDidHide(()=>{shown.current=false;serial.current++;locked.current=false;setBusy(false);});
 useEffect(()=>{if(screen!=='waiting')return;const timer=setInterval(()=>{if(shown.current)void check();},4000);return()=>clearInterval(timer);},[screen]);
 useEffect(()=>()=>{shown.current=false;serial.current++;cancelInviteLogin(loginFlow.current);},[]);
 // A neutral screen prevents the invitation form flashing before a member enters home.
 if(screen==='checking')return <View className='invite-page invite-checking'><View className='invite-brand'>单词共学</View><View className='muted'>正在进入…</View></View>;
 return <View className='invite-page'><View className='invite-brand'>单词共学</View><View className='invite-content'>
  <View className={`invite-mark ${screen==='waiting'?'invite-mark-waiting':''}`}>{screen==='waiting'?'✓':screen==='unavailable'?'…':'＋'}</View>
  <View className='invite-title'>{screen==='waiting'?'申请已发送':screen==='unavailable'?'邀请暂时不可用':screen==='error'?'暂时无法打开':'和家人一起陪学'}</View>
  <View className='invite-description'>{screen==='waiting'?`等待“${familyName}”的管理员确认。通过后会自动进入首页。`:screen==='unavailable'?'请家人重新分享邀请卡片。已加入的家长可以直接返回首页。':screen==='error'?'检查网络后重试，已提交的申请会保留。':familyName?`加入“${familyName}”，一起查看孩子的学习进度。`:'微信登录并申请加入，家人确认后即可一起陪学。'}</View>
  {error&&<View className='error'>{error}</View>}
  {screen==='login'?<Button className='btn primary' onClick={()=>void startLogin()}>微信登录并申请加入</Button>:screen==='ready'?<><Button className='btn primary' loading={busy} disabled={busy} onClick={()=>void check(true)}>加入家庭</Button><View className='invite-note'>提交后由家人确认</View></>:screen==='waiting'?<Button className='btn secondary' disabled={busy} onClick={()=>void home()}>先去首页</Button>:screen==='error'?<Button className='btn primary' disabled={busy} onClick={()=>void check()}>重新连接</Button>:<Button className='btn primary' onClick={()=>void home()}>返回首页</Button>}
 </View>{['login','ready','error'].includes(screen)&&<Button className='invite-later' disabled={busy} onClick={()=>void home()}>稍后再说</Button>}</View>;
}
