import {useEffect,useRef,useState} from 'react';
import {Button,Form,Image,Input,Text,View} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {api,eventId,message,storage} from '../services/api';
import type {ParentProfile} from '../services/parents';
import {ParentAvatar} from './ParentAvatar';
import './Parents.css';
export function ParentProfileEditor({profile,onClose,onSaved,registration=false}:{profile:ParentProfile;onClose:()=>void;onSaved:(profile:ParentProfile)=>void|Promise<void>;registration?:boolean}){
 const [name,setName]=useState(profile.display_name),[preview,setPreview]=useState(''),[avatar,setAvatar]=useState<{base64:string;mime:string}|null>(null),[removed,setRemoved]=useState(false),[busy,setBusy]=useState(false),[preparing,setPreparing]=useState(false),[error,setError]=useState('');
 const account=useRef(storage.get('access_token')),version=useRef(profile.version),serial=useRef(0),locked=useRef(false),alive=useRef(true),request=useRef<{body:string;key:string}|null>(null),current=()=>alive.current&&account.current===storage.get('access_token');
 useEffect(()=>()=>{alive.current=false;serial.current++;},[]);
 const persist=async(nickname:string,chosen:typeof avatar,remove=false)=>{
  if(locked.current||!current())return;locked.current=true;setBusy(true);setError('');
  const body={display_name:nickname,expected_version:version.current,...(chosen?{avatar_base64:chosen.base64,avatar_mime:chosen.mime}:remove?{remove_avatar:true}:{})},serialized=JSON.stringify(body);
  if(request.current?.body!==serialized)request.current={body:serialized,key:eventId()};
  try{const saved=await api<ParentProfile>('/me/profile','PUT',body,request.current!.key);if(current()){version.current=saved.version;request.current=null;await onSaved(saved);}}
  catch(e){if(current())setError(message(e));}finally{locked.current=false;if(current())setBusy(false);}
 };
 const choose=async(event:any)=>{
  const path=event.detail?.avatarUrl;if(!path||locked.current)return;const ticket=++serial.current;setPreparing(true);setError('');
  try{
   const compressed=await Taro.compressImage({src:path,quality:75,compressedWidth:160,compressedHeight:160});const info=await Taro.getImageInfo({src:compressed.tempFilePath});
   const base64=await new Promise<string>((resolve,reject)=>Taro.getFileSystemManager().readFile({filePath:compressed.tempFilePath,encoding:'base64',success:value=>resolve(String(value.data)),fail:reject}));
   if(!current()||ticket!==serial.current)return;if(base64.length>174764||!['jpg','jpeg','png'].includes(info.type))throw Error('头像图片较大或格式不支持，请换一张重试。');
   const chosen={base64,mime:info.type==='png'?'image/png':'image/jpeg'};setAvatar(chosen);setPreview(compressed.tempFilePath);setRemoved(false);
   if(registration)await persist(profile.display_name,chosen);
  }catch(e){if(current()&&ticket===serial.current)setError(message(e));}finally{if(current()&&ticket===serial.current)setPreparing(false);}
 };
 const save=async(event:any)=>{
  if(locked.current||preparing||!current())return;const nickname=String(event.detail?.value?.nickname??name).trim();if(!nickname){setError('请填写家长昵称。');return;}
  await persist(nickname,avatar,removed);
 };
 if(registration)return <View className='registration-profile'>
  <View className='registration-profile-avatar'>{preview?<Image className='registration-profile-preview' src={preview} mode='aspectFill'/>:<ParentAvatar profile={{...profile,is_self:true}}/>}</View>
  <View className='registration-profile-title'>让家人一眼认出你</View>
  <View className='registration-profile-copy'>选择微信头像，作为你的共学头像</View>
  <View className='registration-profile-actions'>
   {error&&<View className='error' role='alert'>{error}</View>}
   <Button className='btn primary registration-profile-button' openType={avatar&&error?undefined:'chooseAvatar'} onChooseAvatar={choose} onClick={()=>{if(avatar&&error)void persist(profile.display_name,avatar);}} onError={()=>setError('暂时无法选择头像，请更新微信后重试，或稍后在家庭页面设置。')} disabled={busy||preparing}>{busy?'正在保存…':preparing?'正在准备…':avatar&&error?'重试保存':'选择微信头像'}</Button>
   <View className='registration-profile-hint'>选好后自动保存，可随时修改</View>
   {avatar&&error&&<Button className='parent-text-button' openType='chooseAvatar' onChooseAvatar={choose} disabled={busy||preparing}>重新选择头像</Button>}
   <Button className='parent-text-button registration-profile-skip' disabled={busy||preparing} onClick={onClose}>暂时跳过</Button>
  </View>
 </View>;
 return <View className='parent-profile-backdrop' onClick={()=>{if(!busy&&!preparing)onClose();}}><View className='parent-profile-sheet' onClick={event=>event.stopPropagation()}>
  <View className='parent-profile-heading'><View>我的家长资料</View><Button className='parent-text-button' disabled={busy||preparing} onClick={onClose}>关闭</Button></View><View className='muted small'>由你选择头像和昵称，用于家人识别。</View>
  {error&&<View className='error'>{error}</View>}
  <Form onSubmit={save}>
   <Button className='parent-choose-avatar' openType='chooseAvatar' onChooseAvatar={choose} disabled={busy||preparing}>{preview?<Image className='parent-profile-preview' src={preview} mode='aspectFill'/>:<ParentAvatar profile={removed?{...profile,avatar_path:null,is_self:true}:profile}/>}<Text>{preparing?'正在准备头像…':'选择微信头像'}</Text></Button>
   {(avatar||profile.avatar_path)&&!removed&&<Button className='parent-text-button parent-remove-avatar' disabled={busy||preparing} onClick={()=>{serial.current++;setAvatar(null);setPreview('');setRemoved(true);}}>移除头像</Button>}
   <View className='parent-field-label'>家长昵称</View><Input className='field' type='nickname' name='nickname' value={name} maxlength={40} disabled={busy||preparing} placeholder='填写昵称，也可选择微信昵称' onInput={event=>setName(event.detail.value)} onBlur={event=>setName(event.detail.value)}/>
   <Button className='btn primary' formType='submit' disabled={busy||preparing||!name.trim()}>{busy?'正在保存…':'保存资料'}</Button><View className='parent-profile-hint'>头像和昵称可随时修改，不影响家庭权限。</View>
  </Form>
 </View></View>;
}
