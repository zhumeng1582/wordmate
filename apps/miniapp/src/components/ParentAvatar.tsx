import {useEffect,useState} from 'react';
import {Image,Text,View} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {storage} from '../services/api';
import {parentName,type ParentProfile} from '../services/parents';
import './Parents.css';
export function ParentAvatar({profile,small=false}:{profile:ParentProfile;small?:boolean}){
 const [file,setFile]=useState(''),token=storage.get('access_token'),path=profile.avatar_path;
 useEffect(()=>{
  let cancelled=false,local='';setFile('');
  const remove=(filePath:string)=>{if(filePath)try{Taro.getFileSystemManager().unlink({filePath,fail:()=>{}});}catch{}};
  if(path&&/^\/parents\/[0-9a-f-]{36}\/avatar\?v=[1-9][0-9]*$/.test(path))void Taro.downloadFile({url:API_BASE+path,header:{Authorization:`Bearer ${token}`},timeout:12000}).then(result=>{
   local=result.tempFilePath;if(cancelled||token!==storage.get('access_token')||result.statusCode!==200){remove(local);local='';return;}setFile(local);
  }).catch(()=>{});
  return()=>{cancelled=true;remove(local);};
 },[path,token]);
 return <View className={`parent-avatar ${small?'parent-avatar-small':''}`}>{file?<Image className='parent-avatar-image' src={file} mode='aspectFill' onError={()=>setFile('')}/>:<Text>{profile.is_self?'我':Array.from(parentName(profile))[0]}</Text>}</View>;
}
