import {Chevron} from '../../components/Chevron';
import {useRef,useState} from 'react';
import {View,Text,Button} from '@tarojs/components';
import Taro,{useDidShow,useDidHide} from '@tarojs/taro';
import {api,eventId,message,storage,go,openLogin} from '../../services/api';
import {selectFamilyContext} from '../../services/family-context';
import {aiQuery,aiMoney,aiCallLabel,providerNames,type AiSettings} from '../../services/ai-settings';
import '../ai-settings/index.css';
import './index.css';

type Call={id:string;kind:string;mode:string;provider:string;model:string;state:string;charge_micros:number;input_tokens:number|null;output_tokens:number|null;cached_tokens:number|null;billable_characters?:number|null;audio_yuan_per_10000_characters?:string|null;created_at:string};
type Entry={id:string;kind:string;amount_micros:number;created_at:string};
type Product={id:string;label:string;amount_fen:number;credit_micros:number};
type Order={id:string;state:string;credit_micros:number|string;created_at:string};
type Recharges={enabled:boolean;ios_enabled:boolean;products:Product[];orders:Order[]};
const orderStates:Record<string,string>={pending:'待确认',paid:'已到账',refunded:'已退款',closed:'已关闭'};
const entryNames:Record<string,string>={gift:'家庭赠送',credit:'充值到账',transfer:'历史余额转入',refund:'退款扣回'};
const dateLabel=(value:string)=>{const date=new Date(value);return `${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;};

export default function AiUsagePage(){
 const [data,setData]=useState<AiSettings|null>(null),[history,setHistory]=useState<{items:Call[];entries:Entry[]}>({items:[],entries:[]}),[recharges,setRecharges]=useState<Recharges|null>(null);
 const [tab,setTab]=useState<'calls'|'entries'>('calls'),[limit,setLimit]=useState(10),[expanded,setExpanded]=useState(''),[explain,setExplain]=useState(false),[purchase,setPurchase]=useState(false),[ordersOpen,setOrdersOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const shown=useRef(false),serial=useRef(0),inFlight=useRef(false),reloadOnShow=useRef(false),context=useRef('');
 const refresh=async(family=storage.get('family_id') as string)=>{
  const current=++serial.current,token=storage.get('access_token'),scope=`${token}:${family||''}`;
  if(context.current!==scope){context.current=scope;setData(null);setHistory({items:[],entries:[]});setRecharges(null);setPurchase(false);setExpanded('');setLimit(10);}if(!token)return;
  let result:[AiSettings,{items:Call[];entries:Entry[]},Recharges];
  try{result=await Promise.all([api<AiSettings>('/me/ai-settings'+aiQuery('text',family)),api<{items:Call[];entries:Entry[]}>('/me/ai-usage'+aiQuery('text',family)),api<Recharges>('/me/ai-recharges'+aiQuery('text',family))]);}
  catch(e){if(shown.current&&current===serial.current&&(e as Error)?.message==='FAMILY_NOT_FOUND'&&family){selectFamilyContext(storage,'');setData(null);return refresh('');}throw e;}
  if(!shown.current||current!==serial.current||token!==storage.get('access_token'))return;const [settings,calls,catalog]=result;if(settings.family_id&&!family){selectFamilyContext(storage,settings.family_id);context.current=`${token}:${settings.family_id}`;}setData(settings);setHistory(calls);setRecharges(catalog);
 };
 const load=async()=>{if(!data||context.current!==`${storage.get('access_token')}:${storage.get('family_id')||''}`)setBusy(true);try{await refresh();if(shown.current)setError('');}catch(e){if(shown.current)setError(message(e));}finally{if(shown.current&&!inFlight.current)setBusy(false);}};
 const run=async(fn:()=>Promise<unknown>)=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){if(shown.current)setError(message(e));}finally{inFlight.current=false;setBusy(false);if(shown.current&&reloadOnShow.current){reloadOnShow.current=false;void load();}}};
 useDidShow(()=>{shown.current=true;if(context.current!==`${storage.get('access_token')}:${storage.get('family_id')||''}`){setData(null);setHistory({items:[],entries:[]});setRecharges(null);}if(inFlight.current)reloadOnShow.current=true;else{reloadOnShow.current=false;void load();}});useDidHide(()=>{shown.current=false;serial.current++;});
 const checkOrder=(id:string)=>run(async()=>{const order=await api(`/me/ai-recharges/${id}`,'GET',undefined,undefined,30000);await refresh();if(shown.current)setNotice(order.state==='paid'?'额度已到账。':order.state==='refunded'?'退款已确认，额度已更新。':'订单还在核对，请勿重复购买。');});
 const pendingOrders=(recharges?.orders??[]).filter(order=>order.state==='pending');
 const platform=Taro.getSystemInfoSync().platform,purchaseSupported=Taro.canIUse('requestVirtualPayment')&&(platform!=='ios'||recharges?.ios_enabled);
 const buy=(product:Product)=>run(async()=>{
  if(!data?.family_id||!recharges?.enabled)return;
  if(pendingOrders.length)throw Error('请先核对待确认订单，避免重复购买。');
  if(platform==='ios'&&!recharges.ios_enabled)throw Error('PAYMENT_IOS_UNAVAILABLE');
  if(!Taro.canIUse('requestVirtualPayment'))throw Error('当前微信不支持此购买方式，请升级微信。');
  const answer=await Taro.showModal({title:'补充家庭额度',content:`支付 ¥${(product.amount_fen/100).toFixed(2)}，获得 ${aiMoney(product.credit_micros)} 额度，由“${data.family_name}”的家长共同使用。按实际用量扣减，赠送额度不可退款。${platform==='ios'?'iOS 购买退款由 Apple 审核。':'退款请联系服务方。'}`,confirmText:'确认购买'});if(!answer.confirm)return;
  const pendingKey=`ai-recharge-request:${storage.get('access_token')}:${data.family_id}`,previous=storage.get(pendingKey),request=previous?.product_id===product.id?previous:{product_id:product.id,request_id:eventId(),family_id:data.family_id};storage.set(pendingKey,request);
  const code=(await Taro.login()).code,order=await api('/me/ai-recharges','POST',{...request,code,platform:platform==='ios'?'ios':platform==='android'?'android':'other'},undefined,30000);Taro.removeStorageSync(pendingKey);
  if(order.pay_data){try{await new Promise<void>((resolve,reject)=>{(Taro as any).requestVirtualPayment({...order.pay_data,success:()=>resolve(),fail:(e:any)=>reject(Error(/cancel/i.test(e.errMsg??'')?'支付已取消，可在充值订单中核对状态。':'支付结果待确认，请核对订单，避免重复购买。'))});});}catch(e){await refresh();setOrdersOpen(true);throw e;}}
  const checked=await api(`/me/ai-recharges/${order.id}`,'GET',undefined,undefined,30000);await refresh();if(shown.current){setOrdersOpen(true);setNotice(checked.state==='paid'?'额度已到账。':'支付结果还在核对，确认后自动到账。');}
 });
 const rows=tab==='calls'?history.items:history.entries;
 return <View className='page ai-usage-page'>
  <View className='title'>额度与用量</View><View className='ai-page-intro'>查看家庭额度和使用记录</View>
  {error&&<View className='error'>{error}<Button className='text-action' disabled={busy} onClick={()=>void run(()=>refresh())}>重新加载</Button></View>}{notice&&<View className='notice'>{notice}</View>}
  {!storage.get('access_token')?<Button className='btn primary' onClick={()=>void openLogin()}>先微信登录</Button>:!data?<View className='card muted'>{busy?'正在加载…':'暂时无法加载，请重试。'}</View>:!data.family_id?<View className='card'><View>先选择要查看的家庭。</View><Button className='btn primary' onClick={()=>go('ai-settings')}>选择家庭</Button></View>:<>
   <View className='ai-family-label'>{data.family_name} · 家庭共享</View>
   <View className='card ai-credit-card'><View className='ai-credit-heading'>可用额度</View><View className='ai-credit-amount'>{aiMoney(data.available_micros)}</View><Button className='ai-inline-action ai-balance-details' onClick={()=>setExplain(value=>!value)}>{explain?'收起说明':'额度与扣费说明'}<Chevron direction={explain?'up':'down'}/></Button>
    {recharges&&!recharges.enabled&&<View className='ai-recharge-status'><View>充值暂未开放</View><View className='muted small'>当前可使用已有家庭额度，已有单词可继续学习。</View></View>}
    {explain&&<View className='ai-usage-explain'><View>正在结算：{aiMoney(data.frozen_micros)}</View><View>赠送剩余：{aiMoney(data.gift_remaining_micros)}</View><View>每笔费用按该次任务的模型价格，以及实际输入、输出和缓存用量计算，精确到 0.000001 元。</View><View>生成前预留费用，完成并保存后扣除实际费用，释放剩余预留；未完成的生成不扣家庭额度。</View><View>单词和例句的新发音按输入字符扣家庭额度{data.audio_yuan_per_10000_characters?`，当前 ¥${data.audio_yuan_per_10000_characters}/万字符`:''}；已生成音频可重复播放，不重复扣费。音色试听不扣费。</View>{data.tutor_prices&&<View>单词小老师：语音识别 {data.tutor_prices.asr_yuan_per_minute?`¥${data.tutor_prices.asr_yuan_per_minute}/分钟`:'未配置'}；联网搜索 {data.tutor_prices.search_yuan_per_call?`¥${data.tutor_prices.search_yuan_per_call}/次，加输入 ¥${data.tutor_prices.search_input_yuan_per_million}/百万 Token、输出 ¥${data.tutor_prices.search_output_yuan_per_million}/百万 Token`:'未配置'}；生成图片 {data.tutor_prices.image_yuan_per_image?`¥${data.tutor_prices.image_yuan_per_image}/张`:'未配置'}。</View>}<View>每个家庭一次性赠送 {aiMoney(data.welcome_credit_micros,true)}。默认服务使用家庭额度；个人 AI 账号的费用由服务商收取，不扣家庭额度。</View></View>}
    {data.legacy_balance_micros!==0&&<View className='notice'>另有历史个人余额 {aiMoney(data.legacy_balance_micros)}，请联系运营者确认归属。</View>}
    {recharges?.enabled&&<Button className='btn secondary' disabled={busy||!purchaseSupported||!!pendingOrders.length} onClick={()=>setPurchase(value=>!value)}>{purchase?'收起充值选项':'补充额度'}</Button>}
    {recharges?.enabled&&!purchaseSupported&&<View className='muted small'>当前微信暂不支持购买。</View>}
    {purchase&&recharges?.enabled&&recharges.products.map(product=><Button key={product.id} className='btn secondary' disabled={busy||!!pendingOrders.length} onClick={()=>void buy(product)}>{product.label} · ¥{(product.amount_fen/100).toFixed(2)}</Button>)}
   </View>
   {pendingOrders.length>0&&<View className='notice'>有 {pendingOrders.length} 笔订单待确认，请先核对，避免重复购买。<Button className='text-action' disabled={busy} onClick={()=>setOrdersOpen(true)}>查看待确认订单</Button></View>}
   <View className='ai-record-tabs'>{(['calls','entries'] as const).map(value=><Button key={value} className={`ai-record-tab ${tab===value?'is-selected':''}`} onClick={()=>{setTab(value);setLimit(10);setExpanded('');}}>{value==='calls'?'使用记录':'额度明细'}</Button>)}</View>
   <View className='card ai-records'>
    {!rows.length?<View className='ai-record-empty'>{tab==='calls'?'还没有使用记录，添加学习材料后会显示在这里。':'还没有额度变动。'}</View>:tab==='calls'?history.items.slice(0,limit).map(call=>{const label=aiCallLabel(call);return <View className='ai-record-row' key={call.id}><View className='ai-record-heading'><Text>{call.kind==='audio'?'语音生成':call.kind==='vision'?'图片识别':call.kind==='connection_test'?'连接检查':call.kind==='word_tutor'?'单词小老师':call.kind==='tutor_asr'?'语音识别':call.kind==='tutor_search'?'联网搜索':call.kind==='tutor_image'?'图片生成':'单词整理'}</Text><Text className='ai-record-amount'>{label.cost}</Text></View><View className='ai-record-meta'>{dateLabel(call.created_at)} · {label.state}</View><Button className='ai-inline-action ai-record-detail' onClick={()=>setExpanded(expanded===call.id?'':call.id)}>{expanded===call.id?'收起详情':'详情'}<Chevron direction={expanded===call.id?'up':'down'}/></Button>{expanded===call.id&&<View className='ai-record-expanded'><View>{call.mode==='byok'?'个人 AI 账号':'默认服务'} · {providerNames[call.provider]??call.provider}</View><View>模型：{call.model}</View>{call.kind==='audio'?<View>计费字符：{call.billable_characters??'待确认'} · ¥{call.audio_yuan_per_10000_characters??'待确认'}/万字符</View>:<View>输入 {call.input_tokens??'未返回'} / 输出 {call.output_tokens??'未返回'} / 缓存 {call.cached_tokens??'未返回'} Token</View>}</View>}</View>;}):history.entries.slice(0,limit).map(entry=><View className='ai-record-row' key={entry.id}><View className='ai-record-heading'><Text>{entryNames[entry.kind]??'生成扣费'}</Text><Text className='ai-record-amount'>{aiMoney(entry.amount_micros)}</Text></View><View className='ai-record-meta'>{dateLabel(entry.created_at)}</View></View>)}
    {rows.length>limit&&<Button className='text-action' onClick={()=>setLimit(value=>value+10)}>查看更多</Button>}{rows.length>0&&<View className='ai-record-caption'>显示最近 {rows.length} 条记录</View>}
   </View>
   {!!recharges?.orders.length&&<View className='card'><Button className='ai-menu-row' onClick={()=>setOrdersOpen(value=>!value)}><Text>充值订单</Text><Text className='ai-menu-hint'>{ordersOpen?'收起':'查看'}<Chevron direction={ordersOpen?'up':'down'}/></Text></Button>{ordersOpen&&recharges.orders.map(order=><View className='ai-record-row' key={order.id}><View className='ai-record-heading'><Text>{aiMoney(Number(order.credit_micros))}</Text><Text>{orderStates[order.state]??'待确认'}</Text></View><View className='ai-record-meta'>{dateLabel(order.created_at)}</View>{order.state!=='closed'&&<Button className='ai-inline-action' disabled={busy} onClick={()=>void checkOrder(order.id)}>核对订单状态</Button>}<View className='ai-order-id'>订单号：{order.id}</View></View>)}</View>}
  </>}
 </View>;
}
