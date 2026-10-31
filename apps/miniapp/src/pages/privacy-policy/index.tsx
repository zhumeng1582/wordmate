import {useRef,useState} from 'react';
import Taro,{useDidShow} from '@tarojs/taro';
import {View,Button} from '@tarojs/components';
import {api,message} from '../../services/api';
import './index.css';

type Policy={version:string;publishable:boolean;operator:string;contact:string;sections:{title:string;text:string}[];providers:{name:string;url:string}[]};

export default function PrivacyPolicyPage(){
 const [policy,setPolicy]=useState<Policy|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false);
 const load=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{setPolicy(await api<Policy>('/privacy/policy'));}catch(e){setError(message(e));}finally{lock.current=false;setBusy(false);}};
 useDidShow(()=>{void load();});
 const openContract=()=>{if(Taro.canIUse('openPrivacyContract'))void Taro.openPrivacyContract({fail:()=>setError('暂时无法打开微信隐私保护指引，请稍后重试。')});else setError('当前微信版本不支持打开隐私保护指引，请升级微信。');};
 return <View className='page privacy-policy-page'>
  <View className='title'>隐私政策</View>
  {error&&<View className='error'>{error}<Button className='text-action' disabled={busy} onClick={()=>void load()}>重新加载</Button></View>}
  {busy&&!policy&&<View className='muted'>正在加载隐私政策…</View>}
  {policy&&<>
   <View className='muted small'>政策版本 {policy.version}{!policy.publishable?' · 发布信息待补全':''}</View>
   <View className='card privacy-policy-contact'><View>运营者：{policy.operator}</View><View>联系渠道：{policy.contact}</View></View>
   {policy.sections.map(section=><View className='card' key={section.title}><View className='privacy-policy-heading'>{section.title}</View><View className='privacy-policy-text'>{section.text}</View></View>)}
   <View className='card'><View className='privacy-policy-heading'>第三方政策链接</View>{policy.providers.map(provider=><Button className='text-action privacy-provider-link' key={provider.url} onClick={()=>void Taro.setClipboardData({data:provider.url})}>{provider.name} · 复制链接</Button>)}<Button className='text-action privacy-provider-link' onClick={openContract}>微信小程序隐私保护指引</Button></View>
  </>}
  <Button className='btn secondary' onClick={()=>void Taro.navigateBack().catch(()=>Taro.reLaunch({url:'/pages/home/index'}))}>返回上一页</Button>
 </View>;
}
