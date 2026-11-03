import {Chevron} from '../../components/Chevron';
import {useRef,useState} from 'react';
import {View,Text,Button,Picker} from '@tarojs/components';
import Taro,{useDidShow,useDidHide} from '@tarojs/taro';
import {api,message,storage,go,openLogin} from '../../services/api';
import {selectFamilyContext} from '../../services/family-context';
import {aiQuery,aiMoney,aiStatus,capabilityNames,type AiSettings,type AiCapability} from '../../services/ai-settings';
import './index.css';

export default function AiSettingsPage(){
 const [data,setData]=useState<{text:AiSettings;vision:AiSettings}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[help,setHelp]=useState(false);
 const serial=useRef(0),shown=useRef(false),context=useRef('');
 const refresh=async(family=storage.get('family_id') as string)=>{
  const current=++serial.current,token=storage.get('access_token'),scope=`${token}:${family||''}`,changed=context.current!==scope;context.current=scope;
  if(changed||!data)setError('');if(changed)setData(null);if(!token){setBusy(false);return;}
  if(changed||!data)setBusy(true);
  try{
   const [text,vision]=await Promise.all((['text','vision'] as const).map(cap=>api<AiSettings>('/me/ai-settings'+aiQuery(cap,family))));
   if(!shown.current||current!==serial.current||token!==storage.get('access_token'))return;
   if(text.family_id&&!family){selectFamilyContext(storage,text.family_id);context.current=`${token}:${text.family_id}`;}setData({text,vision});setError('');
  }catch(e){if(!shown.current||current!==serial.current)return;if((e as Error)?.message==='FAMILY_NOT_FOUND'&&family){selectFamilyContext(storage,'');setData(null);await refresh('');return;}setError(message(e));}
  finally{if(shown.current&&current===serial.current)setBusy(false);}
 };
 useDidShow(()=>{shown.current=true;void refresh();});useDidHide(()=>{shown.current=false;serial.current++;});
 const settings=data?.text,families=settings?.families??[],familyChoices=settings?.family_id?families:[{id:'',name:'请选择家庭'},...families];
 const familyPicker=<Picker mode='selector' range={familyChoices.map(family=>family.name)} value={Math.max(0,familyChoices.findIndex(family=>family.id===settings?.family_id))} disabled={busy} onChange={event=>{const family=familyChoices[Number(event.detail.value)];if(!family?.id)return;selectFamilyContext(storage,family.id);setData(null);void refresh(family.id);}}><View className='ai-family-picker'>{settings?.family_name??'选择家庭'}<Text className='indicator-label'>切换<Chevron direction='down'/></Text></View></Picker>;
 const advanced=(capability:AiCapability='text')=>Taro.navigateTo({url:`/pages/ai-advanced/index?capability=${capability}`});
 const start=()=>{if(!storage.get('child_id'))return go('family');const status=settings&&aiStatus(settings);return status?.action==='settings'?advanced():status?.action==='usage'?go('ai-usage'):go('add-words');};
 return <View className='page ai-settings-page'>
  <View className='title'>AI 助手</View><View className='ai-page-intro'>帮你整理单词、识别学习材料</View>
  {error&&<View className='error'>{error}<Button className='text-action' disabled={busy} onClick={()=>void refresh()}>重新加载</Button></View>}
  {!storage.get('access_token')?<View className='card ai-empty'><View className='ai-section-title'>先登录，再开始使用</View><View className='muted'>登录后可与家人共享 AI 额度。</View><Button className='btn primary' onClick={()=>void openLogin()}>微信登录</Button></View>:!data?<View className='card ai-empty muted'>{busy?'正在加载 AI 助手…':error?'暂时无法加载，请重试。':'正在准备…'}</View>:!settings?.family_id?<View className='card ai-empty'><View className='ai-section-title'>{families.length?'选择要使用的家庭':'先建立家庭'}</View><View className='muted'>{families.length?'AI 额度由家庭共享，选择后即可查看。':'创建或加入家庭后，就能使用家庭共享额度。'}</View>{families.length>0?familyPicker:<Button className='btn primary' onClick={()=>go('family')}>设置家庭与孩子</Button>}</View>:<>
   {families.length>1?familyPicker:<View className='ai-family-label'>{settings.family_name} · 家庭共享</View>}
   <View className='card ai-credit-card'>
    <View className='ai-credit-heading'><Text>可用额度</Text><Button className='ai-inline-action' onClick={()=>go('ai-usage')}>额度与用量<Chevron/></Button></View>
    <View className='ai-credit-amount'>{aiMoney(settings.available_micros)}</View>
    <View className='muted small'>{settings.gift_remaining_micros>0?'全家共用 · 已含赠送额度':'全家共用 · 按实际使用扣减'}</View>
    {settings.frozen_micros>0&&<View className='ai-credit-note'>另有 {aiMoney(settings.frozen_micros)} 正在结算</View>}
   </View>
   <Button className='btn primary ai-start' disabled={busy} onClick={()=>void start()}>{!storage.get('child_id')?'选择孩子，开始使用':aiStatus(settings).action==='settings'?'设置单词整理服务':aiStatus(settings).action==='usage'?'查看额度与用量':'去添加单词'}</Button>
   <View className='ai-start-hint'>{aiStatus(settings).ready?'提交学习材料后，按实际使用结算。':'已有单词和学习记录仍可继续使用。'}</View>
   <View className='card ai-features'>
    {(['text','vision'] as const).map(capability=>{const status=aiStatus(data[capability]);return <View className='ai-feature' key={capability}><View className='ai-feature-copy'><View className='ai-section-title'>{capabilityNames[capability]}</View><View className='muted small'>{capability==='text'?'自动补充释义和例句':'拍照或选图，提取学习内容'}</View></View>{status.ready?<View className='ai-ready'>{status.detail}</View>:<Button className='ai-status-action' disabled={busy} onClick={()=>status.action==='usage'?go('ai-usage'):void advanced(capability)}>{status.label}<Chevron/></Button>}</View>;})}
   </View>
   <View className='card ai-more'>
    <Button className='ai-menu-row' onClick={()=>setHelp(value=>!value)}><Text>第一次使用？</Text><Text className='ai-menu-hint'>{help?'收起':'查看说明'}<Chevron direction={help?'up':'down'}/></Text></Button>
    {help&&<View className='ai-help'><View>1. 点击“去添加单词”，粘贴文字或选择学习图片。</View><View>2. AI 补充释义和例句，确认后加入单词本。</View><View>3. 默认服务使用家庭额度，未完成的生成不扣额度。</View><View>每个家庭一次性赠送 {aiMoney(settings.welcome_credit_micros,true)}。使用默认服务时，无需选择模型或填写密钥。</View><Button className='text-action' onClick={()=>go('privacy-policy')}>查看服务与隐私说明</Button></View>}
    <Button className='ai-menu-row' onClick={()=>void advanced()}><Text>高级设置</Text><Text className='ai-menu-hint'>使用自己的 AI 账号<Chevron/></Text></Button>
   </View>
  </>}
 </View>;
}
