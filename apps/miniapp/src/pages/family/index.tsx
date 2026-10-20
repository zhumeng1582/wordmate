import {useState} from 'react';
import {View,Button,Input,Picker} from '@tarojs/components';
import Taro,{useDidShow} from '@tarojs/taro';
import {api,storage,login,eventId,message} from '../../services/api';
export default function Family(){
  const [families,setFamilies]=useState<any[]>([]),[family,setFamily]=useState<any>(null),[children,setChildren]=useState<any[]>([]),[name,setName]=useState(''),[nickname,setNickname]=useState(''),[accent,setAccent]=useState(0),[token,setToken]=useState(''),[invites,setInvites]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const run=async(fn:()=>Promise<any>)=>{if(busy)return;setBusy(true);setError('');try{await fn();}catch(e){setError(message(e));}finally{setBusy(false);}};
  const refresh=async()=>setFamilies((await api('/me')).families);
  const select=async(f:any)=>{setFamily(f);setChildren((await api(`/families/${f.id}/children`)).items);setInvites(f.role==='owner'?(await api(`/families/${f.id}/invites`)).items:[]);};
  useDidShow(()=>{if(storage.get('access_token'))void run(refresh);});
  return <View className='page'><View className='title'>家庭与孩子</View>{error&&<View className='error'>{error}</View>}
    <View className='card'><Button disabled={busy} className='primary' onClick={()=>run(async()=>{await login();setFamily(null);setChildren([]);await refresh();})}>{DEV_AUTH?'开发登录：爸爸':'微信登录'}</Button>{DEV_AUTH&&<Button disabled={busy} onClick={()=>run(async()=>{await login('dev-mom');setFamily(null);setChildren([]);await refresh();})}>开发登录：妈妈</Button>}</View>
    {families.map(f=><Button key={f.id} disabled={busy} onClick={()=>run(()=>select(f))}>{f.name} · {f.role==='owner'?'管理员':'家长'}</Button>)}
    {storage.get('access_token')&&<><View className='card'><Input className='field' placeholder='家庭名称' maxlength={40} value={name} onInput={e=>setName(e.detail.value)}/><Button disabled={busy||!name.trim()} onClick={()=>run(async()=>{const f=await api('/families','POST',{name},eventId());await refresh();await select(f);setName('');})}>创建家庭</Button></View>
    <View className='card'><Input className='field' placeholder='粘贴家庭邀请口令' value={token} onInput={e=>setToken(e.detail.value)}/><Button disabled={busy||!token} onClick={()=>run(async()=>{await api('/family-invites/claim','POST',{invite_token:token},eventId());Taro.showToast({title:'已申请，等待管理员批准',icon:'none'});setToken('');})}>申请加入家庭</Button><Button disabled={busy} onClick={()=>run(refresh)}>刷新加入结果</Button></View></>}
    {family&&<View className='card'><View>{family.name}的孩子</View>{children.map(c=><Button key={c.id} onClick={()=>{storage.set('child_id',c.id);Taro.navigateBack();}}>选择 {c.nickname}</Button>)}<Input className='field' placeholder='孩子昵称' maxlength={40} value={nickname} onInput={e=>setNickname(e.detail.value)}/><Picker mode='selector' range={['美音','英音']} value={accent} onChange={e=>setAccent(Number(e.detail.value))}><View className='field'>默认口音：{accent?'英音':'美音'} ▾</View></Picker><Button disabled={busy||!nickname.trim()} onClick={()=>run(async()=>{await api(`/families/${family.id}/children`,'POST',{nickname,accent:accent?'en-GB':'en-US'},eventId());setNickname('');await select(family);})}>添加孩子</Button>
    {family.role==='owner'&&<><Button disabled={busy} onClick={()=>run(async()=>{const i=await api(`/families/${family.id}/invites`,'POST',{},eventId());await Taro.setClipboardData({data:i.invite_token});await select(family);})}>生成邀请口令并复制</Button><View className='muted'>口令有效期 24 小时；另一位家长申请后，由你批准。</View><Button disabled={busy} onClick={()=>run(()=>select(family))}>刷新申请</Button>{invites.filter(i=>i.status==='claimed').map(i=><Button key={i.id} disabled={busy} onClick={()=>run(async()=>{await api(`/family-invites/${i.id}/approve`,'POST',{},eventId());await select(family);})}>批准 {i.applicant} 加入</Button>)}</>}
    </View>}
  </View>;
}
