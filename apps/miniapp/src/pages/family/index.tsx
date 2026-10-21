import {AudioPreferences} from '../../components/AudioPreferences';
import {useRef,useState} from 'react';
import {View,Button,Input,Picker,Text} from '@tarojs/components';
import Taro,{useDidShow,useShareAppMessage} from '@tarojs/taro';
import {api,storage,login,eventId,message} from '../../services/api';
import './index.css';
const inviteCover='/assets/invite-cover.png';
type Panel=''|'account'|'family'|'child'|'join'|'invites'|'share'|'audio';
export default function Family(){
  const [family,setFamily]=useState<any>(null),[families,setFamilies]=useState<any[]>([]),[members,setMembers]=useState<any[]>([]),[children,setChildren]=useState<any[]>([]);
  const [name,setName]=useState(''),[nickname,setNickname]=useState(''),[token,setToken]=useState(''),[invites,setInvites]=useState<any[]>([]);
  const [panel,setPanel]=useState<Panel>(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[signedIn,setSignedIn]=useState(!!storage.get('access_token')),[detailsReady,setDetailsReady]=useState(false);
  const [shareInvite,setShareInvite]=useState<any>(null);
  const shareReady=!!shareInvite&&shareInvite.family_id===family?.id&&family?.role==='owner'&&new Date(shareInvite.expires_at).getTime()>Date.now();
  useShareAppMessage(({from})=>({title:'邀请你一起陪孩子学单词',imageUrl:inviteCover,path:from==='button'&&shareReady&&new Date(shareInvite.expires_at).getTime()>Date.now()?`/pages/invite/index?token=${encodeURIComponent(shareInvite.invite_token)}`:'/pages/home/index'}));
  const running=useRef(false);
  const run=async(fn:()=>Promise<any>)=>{if(running.current)return;running.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(message(e));}finally{running.current=false;setBusy(false);}};
  const select=async(f:any)=>{
    setFamily(f);setDetailsReady(false);setMembers([]);setChildren([]);setInvites([]);storage.set('family_id',f.id);
    const [kids,people,requests]=await Promise.all([api(`/families/${f.id}/children`),api(`/families/${f.id}/members`),f.role==='owner'?api(`/families/${f.id}/invites`):Promise.resolve({items:[]})]);
    setFamily(f);setChildren(kids.items);setMembers(people.items);setInvites(requests.items);setDetailsReady(true);storage.set('family_id',f.id);
  };
  const refresh=async()=>{const list=(await api('/me')).families;setFamilies(list);const selected=list.find((f:any)=>f.id===storage.get('family_id'))??list[0];if(selected)await select(selected);else{setFamily(null);setMembers([]);setChildren([]);setInvites([]);}};
  const signIn=async(identity='dev-dad')=>{await login(identity);setShareInvite(null);setSignedIn(true);await refresh();setPanel('');};
  useDidShow(()=>{if(storage.get('access_token'))void run(refresh);});
  const open=(next:Panel)=>{setError('');setPanel(next);};
  const chooseChild=(c:any)=>{storage.set('child_id',c.id);Taro.reLaunch({url:'/pages/home/index'});};
  const navigate=(page:string)=>{if(page==='words'&&!storage.get('child_id')){Taro.showToast({title:'请先选择孩子',icon:'none'});open('child');return;}if(page==='home')Taro.reLaunch({url:'/pages/home/index'});else Taro.navigateTo({url:`/pages/${page}/index`});};
  const pending=invites.filter(i=>i.status==='claimed');
  return <View className='family-page'>
    <View className='family-content'>
      <View className='family-breadcrumb' onClick={()=>families.length>1&&open('account')}>我的 / {family?.name??'家庭共学'}{families.length>1?' ▾':''}</View>
      <View className='family-heading'>两个人陪，一个进度</View>
      {error&&!panel&&<View className='error'>{error}</View>}
      {!signedIn?<View className='member-card member-owner'><View className='member-title'>和家人一起，陪孩子成长</View><View className='member-description'>登录后创建家庭，保存孩子的独立学习进度。</View><Button className='btn primary' disabled={busy} onClick={()=>run(()=>signIn())}>{DEV_AUTH?'以爸爸身份体验':'微信登录'}</Button></View>:family?<>
        {!detailsReady&&<View className='member-card'><View className='member-title'>{busy?'正在加载家庭资料':'家庭资料未加载完成'}</View><View className='member-description'>家庭已存在，请勿重复创建。后端重启后可重试。</View><Button className='btn secondary' disabled={busy} onClick={()=>run(refresh)}>重新加载</Button></View>}
        {members.map(m=><View className={`member-card ${m.role==='owner'?'member-owner':''}`} key={m.user_id}><View className='member-title'>{m.display_name.replace('（开发）','')} · {m.role==='owner'?'管理员':'共同家长'}</View><View className='member-description'>{m.role==='owner'?'邀请、审批和管理孩子':'录词、陪学，共同记录学习进度'}</View></View>)}
        {members.length===1&&<View className='member-card member-empty'><View className='member-title'>邀请另一位家长</View><View className='member-description'>加入同一个家庭，一起陪孩子学单词。</View></View>}
        <View className='member-card child-card' onClick={()=>detailsReady&&open('child')}><View className='member-title'>孩子档案 <Text className='card-chevron'>›</Text></View><View className='member-description'>{!detailsReady?'等待家庭资料加载':children.length?children.map(c=>`${c.nickname} · ${c.level}`).join('　　'):'添加孩子，开始记录学习进度'}</View></View>
        {pending.length>0&&<View className='pending-card' onClick={()=>open('invites')}>{pending.length} 位家长申请加入 <Text>查看申请 ›</Text></View>}
      </>:error||busy?<View className='member-card'><View className='member-title'>{busy?'正在加载家庭':'暂时无法加载家庭'}</View><Button className='btn secondary' disabled={busy} onClick={()=>run(refresh)}>重试加载</Button></View>:<View className='member-card member-owner'><View className='member-title'>建立你们的家庭</View><View className='member-description'>创建家庭，或用另一位家长的口令申请加入。</View><Button className='btn primary' disabled={busy} onClick={()=>open('family')}>创建家庭</Button><Button className='btn secondary' disabled={busy} onClick={()=>open('join')}>加入已有家庭</Button></View>}
    </View>
    <View className='family-actions'>
      {family&&<Button className='btn primary invite-button' disabled={busy} onClick={()=>family.role==='owner'?run(async()=>{if(!shareReady){const invite=await api(`/families/${family.id}/invites`,'POST',{},eventId());setShareInvite({...invite,family_id:family.id});}open('share');}):open('child')}>{family.role==='owner'?'邀请另一位家长':'选择孩子，开始陪学'}</Button>}
      <View className='account-links'><Text onClick={()=>open('child')}>孩子档案</Text>{family?.role==='owner'&&<Text onClick={()=>run(async()=>{await refresh();open('invites');})}>邀请与审批{pending.length?` · ${pending.length}`:''}</Text>}{signedIn&&<Text onClick={()=>open('audio')}>发音设置</Text>}<Text onClick={()=>open('account')}>账号管理</Text></View>
      {DEV_AUTH&&<View className='dev-label'>本地体验 · 测试身份与词库</View>}
    </View>
    <View className='family-tabs'><View className='family-tab' onClick={()=>navigate('home')}>今日</View><View className='family-tab' onClick={()=>navigate('words')}>单词本</View><View className='family-tab tab-disabled' onClick={()=>Taro.showToast({title:'日历复习尚在开发中',icon:'none'})}>日历</View><View className='family-tab tab-active'>我的</View></View>
    {!!panel&&<View className='sheet-backdrop' onClick={()=>!busy&&setPanel('')}><View className='family-sheet' onClick={e=>e.stopPropagation()}>
      <View className='sheet-top'><View className='sheet-heading'>{{audio:'发音设置',account:'账号与家庭',family:'创建家庭',child:'孩子档案',join:'加入家庭',invites:'邀请与审批',share:'邀请另一位家长'}[panel]}</View><Button className='sheet-close' disabled={busy} onClick={()=>setPanel('')}>关闭</Button></View>
      {error&&<View className='error'>{error}</View>}
      {panel==='audio'&&<AudioPreferences/>}
      {panel==='share'&&<><View className='muted'>邀请有效期 24 小时，仅供一位家长领取；加入前需要你批准。</View>{shareReady?<><Button className='btn primary' openType='share' disabled={busy}>分享邀请卡片给朋友</Button><Button className='btn secondary' disabled={busy} onClick={()=>run(async()=>{if(new Date(shareInvite.expires_at).getTime()<=Date.now())throw Error('INVITE_UNAVAILABLE');await Taro.setClipboardData({data:shareInvite.invite_token});})}>复制邀请口令</Button><View className='muted'>如果口令已被领取，请为下一位家长生成新邀请。</View></>:<View className='notice'>邀请已过期或家庭已切换，请生成新邀请。</View>}<Button className='btn secondary' disabled={busy||family?.role!=='owner'} onClick={()=>run(async()=>{const invite=await api(`/families/${family.id}/invites`,'POST',{},eventId());setShareInvite({...invite,family_id:family.id});})}>生成新邀请</Button></>}
      {panel==='account'&&<>
        {DEV_AUTH&&<><View className='muted'>测试身份切换仅用于本地联调</View><View className='row'><Button className='btn secondary' disabled={busy} onClick={()=>run(()=>signIn('dev-dad'))}>切换为爸爸</Button><Button className='btn secondary' disabled={busy} onClick={()=>run(()=>signIn('dev-mom'))}>切换为妈妈</Button></View></>}
        {signedIn&&<>{families.map(f=><Button className='btn secondary' key={f.id} disabled={busy} onClick={()=>run(async()=>{await select(f);setPanel('');})}>{f.name} · {f.role==='owner'?'管理员':'家长'}</Button>)}<Button className='btn secondary' onClick={()=>open('family')}>创建新家庭</Button><Button className='btn secondary' onClick={()=>open('join')}>申请加入家庭</Button><Button className='btn secondary' disabled={busy} onClick={()=>run(refresh)}>刷新加入结果</Button></>}
      </>}
      {panel==='family'&&<><View className='form-label'>家庭名称</View><Input className='field' placeholder='例如：小明一家' maxlength={40} value={name} onInput={e=>setName(e.detail.value)}/><Button className='btn primary' disabled={busy||!name.trim()} onClick={()=>run(async()=>{const f=await api('/families','POST',{name},eventId());storage.set('family_id',f.id);setFamily(f);setFamilies(list=>[...list.filter(item=>item.id!==f.id),f]);setName('');setPanel('');Taro.showToast({title:'家庭已创建',icon:'success'});await refresh();setPanel('child');})}>创建家庭</Button></>}
      {panel==='child'&&<>{!family?<View className='muted'>请先登录并创建或加入家庭。</View>:<>{children.map(c=><Button className='btn secondary' key={c.id} onClick={()=>chooseChild(c)}>{c.nickname} · {c.level}　开始学习 ›</Button>)}<View className='form-label'>添加孩子</View><Input className='field' placeholder='孩子昵称' maxlength={40} value={nickname} onInput={e=>setNickname(e.detail.value)}/><Button className='btn primary' disabled={busy||!detailsReady||!nickname.trim()} onClick={()=>run(async()=>{await api(`/families/${family.id}/children`,'POST',{nickname},eventId());setNickname('');await refresh();})}>添加孩子</Button></>}</>}
      {panel==='join'&&<><View className='muted'>粘贴邀请口令，提交后由家庭管理员批准。</View><Input className='field' placeholder='家庭邀请口令' value={token} onInput={e=>setToken(e.detail.value)}/><Button className='btn primary' disabled={busy||!token.trim()} onClick={()=>run(async()=>{await api('/family-invites/claim','POST',{invite_token:token.trim()},eventId());setToken('');Taro.showToast({title:'已申请，等待管理员批准',icon:'none'});})}>申请加入</Button><Button className='btn secondary' disabled={busy} onClick={()=>run(async()=>{await refresh();setPanel('');})}>刷新加入结果</Button></>}
      {panel==='invites'&&<><View className='muted'>口令有效期为 24 小时；领取后需要管理员批准。</View>{pending.length?pending.map(i=><View className='request-row' key={i.id}><View>{i.applicant}</View><Button className='btn primary' disabled={busy} onClick={()=>run(async()=>{await api(`/family-invites/${i.id}/approve`,'POST',{},eventId());await refresh();})}>批准加入</Button></View>):<View className='sheet-empty'>暂时没有待审批的申请</View>}<Button className='btn secondary' disabled={busy} onClick={()=>run(refresh)}>刷新申请</Button></>}
    </View></View>}
  </View>;
}
