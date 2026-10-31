import {useEffect,useRef,useState} from 'react';
import Taro,{useDidShow,useRouter} from '@tarojs/taro';
import {View,Text,Button,Checkbox,CheckboxGroup} from '@tarojs/components';
import {api,storage,login,message,go} from '../../services/api';
import {PRIVACY_AGREE_BUTTON,exposePrivacyAuthorization,finishPrivacyAuthorization} from '../../services/privacy-authorization';
import {acceptInviteLogin} from '../../services/invite-login';
import {ParentProfileEditor} from '../../components/ParentProfileEditor';
import type {ParentProfile} from '../../services/parents';
import './index.css';

type Policy={hash:string;version:string;publishable:boolean};

export default function LoginPage(){
 const router=useRouter(),[policy,setPolicy]=useState<Policy|null>(null),[agreed,setAgreed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [registration,setRegistration]=useState<{profile:ParentProfile;account:string}|null>(null);
 const policyRef=useRef<Policy|null>(null),lock=useRef(false),alive=useRef(true);
 useEffect(()=>()=>{alive.current=false;finishPrivacyAuthorization(false);},[]);
 const loadPolicy=async()=>{const next=await api<Policy>('/privacy/policy');if(!alive.current)return;if(policyRef.current?.hash!==next.hash)setAgreed(false);policyRef.current=next;setPolicy(next);};
 const run=async(fn:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();}catch(e){if(alive.current)setError(message(e));}finally{lock.current=false;if(alive.current)setBusy(false);}};
 useDidShow(()=>{if(!registration){exposePrivacyAuthorization();void run(loadPolicy);}});
 const back=()=>Taro.navigateBack().catch(()=>Taro.reLaunch({url:'/pages/home/index'}));
 const complete=async(account=storage.get('access_token'))=>{
  if(!alive.current||!account||account!==storage.get('access_token'))return;
  Taro.removeStorageSync('registration_avatar_pending');
  if(router.params.intent==='join-family')acceptInviteLogin(String(router.params.flow||''),account);
  await back();
 };
 const accept=async()=>{
  if(!policy||!agreed||!policy.publishable&&!DEV_AUTH)return;
  finishPrivacyAuthorization(true);storage.set('privacy_decision',policy.hash);
  let registeredProfile:ParentProfile|undefined;
  try{
   if(storage.get('access_token'))await api('/me/privacy-consent','PUT',{policy_version:policy.version,policy_hash:policy.hash,guardian_confirmed:true});
   else registeredProfile=(await login(String(router.params.identity||'dev-dad'))).user;
  }catch(e){if(e instanceof Error&&e.message==='PRIVACY_POLICY_CHANGED')await loadPolicy();throw e;}
  if(!alive.current)return;
  const pending=storage.get('registration_avatar_pending') as ParentProfile|undefined;
  if(pending?.id){
   const profile=registeredProfile??(await api<{user:ParentProfile}>('/me')).user;
   if(!alive.current)return;
   if(profile.id===pending.id&&!profile.avatar_path){setRegistration({profile,account:storage.get('access_token')});return;}
  }
  await complete();
 };
 const signedIn=!!storage.get('access_token');
 if(registration)return <View className='login-page login-avatar-page'><ParentProfileEditor profile={registration.profile} registration onClose={()=>void run(()=>complete(registration.account))} onSaved={()=>complete(registration.account)}/>{error&&<View className='error' role='alert'>{error}</View>}</View>;
 return <View className='login-page'>
  <View className='login-main'>
   <View className='login-mark'>Aa</View>
   <View className='login-title'>单词共学</View>
   <View className='login-subtitle'>{router.params.intent==='join-family'?'登录并申请，和家人一起陪学':'每天一点，记得更牢'}</View>
   <View className='login-actions'>
    {error&&<View className='error' role='alert'>{error}{!policy&&<Button className='text-action' disabled={busy} onClick={()=>void run(loadPolicy)}>重新加载</Button>}</View>}
    <Button id={PRIVACY_AGREE_BUTTON} className='btn primary login-button' loading={busy} disabled={busy||!policy||!agreed||!policy.publishable&&!DEV_AUTH}
     openType={Taro.canIUse('button.open-type.agreePrivacyAuthorization')?'agreePrivacyAuthorization':undefined}
     onAgreePrivacyAuthorization={()=>void run(accept)}
     onClick={()=>{if(!Taro.canIUse('button.open-type.agreePrivacyAuthorization'))void run(accept);}}>{router.params.intent==='join-family'?(signedIn?'同意并申请加入':'微信登录并申请加入'):signedIn?'同意并继续':DEV_AUTH?'测试身份登录':'微信登录'}</Button>
    <CheckboxGroup onChange={e=>setAgreed(e.detail.value.includes('consent'))}>
     <View className='login-consent'>
      <Checkbox className='login-checkbox' value='consent' checked={agreed} disabled={busy}/>
      <View className='login-consent-copy'>我已阅读并同意<Text className='login-policy-link' onClick={()=>go('privacy-policy')}>《隐私政策》</Text>，并确认我是监护人或已获得监护人授权。</View>
     </View>
    </CheckboxGroup>
    {policy&&!policy.publishable&&!DEV_AUTH&&<View className='muted small'>服务信息尚未就绪，请稍后再试。</View>}
    <Button className='text-action login-later' disabled={busy} onClick={()=>{finishPrivacyAuthorization(false);void back();}}>稍后再说</Button>
   </View>
  </View>
  <Button className='text-action login-footer' disabled={busy} onClick={()=>go('privacy')}>隐私与数据管理</Button>
 </View>;
}
