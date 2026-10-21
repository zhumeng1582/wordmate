import {useRef,useState} from 'react';
import Taro,{useLoad} from '@tarojs/taro';
import {View,Button} from '@tarojs/components';
import {api,storage,login,eventId,message} from '../../services/api';
export default function Invite(){
 const [token,setToken]=useState(''),[signedIn,setSignedIn]=useState(!!storage.get('access_token')),[submitted,setSubmitted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const inFlight=useRef(false),claimKey=useRef(eventId());
 // Base64url token only; do not persist or log the incoming link.
 useLoad(query=>{const incoming=query.token??'';if(/^[A-Za-z0-9_-]{43}$/.test(incoming))setToken(incoming);else setError('邀请链接不完整，请向邀请人索取新卡片。');});
 const run=async(fn:()=>Promise<void>)=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(message(e));if((e as any)?.status===401)setSignedIn(false);}finally{inFlight.current=false;setBusy(false);}};
 const signIn=async(identity:string)=>{await login(identity);setSignedIn(true);};
 return <View className='page'><View className='subtitle'>家庭共学邀请</View><View className='title'>一起陪孩子学单词</View>
 <View className='card'><View>朋友邀请你加入家庭，共同记录孩子的学习进度。</View><View className='muted'>邀请有效期为 24 小时。申请后，需要家庭管理员批准。</View></View>
 {error&&<View className='error'>{error}</View>}
 {!!token&&!submitted&&(!signedIn?<View className='card'><View className='muted'>先登录，再确认申请加入。</View><Button className='btn primary' disabled={busy} onClick={()=>run(()=>signIn('dev-mom'))}>{DEV_AUTH?'以妈妈测试身份登录':'微信登录'}</Button>{DEV_AUTH&&<Button className='btn' disabled={busy} onClick={()=>run(()=>signIn('dev-dad'))}>以爸爸测试身份登录</Button>}</View>:<Button className='btn primary' disabled={busy} onClick={()=>run(async()=>{await api('/family-invites/claim','POST',{invite_token:token},claimKey.current);setSubmitted(true);setToken('');})}>{busy?'正在提交…':'申请加入家庭'}</Button>)}
 {submitted&&<View className='notice'>申请已提交，请邀请人到“邀请与审批”批准。批准后可在家庭页面刷新加入结果。</View>}
 <Button className='btn' disabled={busy} onClick={()=>Taro.reLaunch({url:'/pages/family/index'})}>{submitted?'查看加入结果':'返回家庭页面'}</Button>
 </View>;
}
