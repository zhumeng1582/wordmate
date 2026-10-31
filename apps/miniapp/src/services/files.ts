import Taro from '@tarojs/taro';
import {api,storage} from './api';
const fs=()=>Taro.getFileSystemManager();
export async function extractFile(child:string,kind:'camera'|'album'|'file',existingText='',theme=''){
 const token=storage.get('access_token'),selectedChild=storage.get('child_id'),family=storage.get('family_id');
 const checkScope=()=>{if(token!==storage.get('access_token')||selectedChild!==storage.get('child_id')||family!==storage.get('family_id'))throw Error('SESSION_CHANGED');};
 if(Taro.canIUse('requirePrivacyAuthorize'))await new Promise<void>((resolve,reject)=>Taro.requirePrivacyAuthorize({success:()=>resolve(),fail:()=>reject(Error('IMPORT_PRIVACY_REQUIRED'))}));
 let path:string,name:string,size:number;
 if(kind==='file'){
  const result=await Taro.chooseMessageFile({count:1,type:'file',extension:['txt','csv','tsv','xlsx','docx']});
  const f=result.tempFiles[0];path=f.path;name=f.name;size=f.size;
 }else{
  const result=await Taro.chooseMedia({count:1,mediaType:['image'],sourceType:[kind],sizeType:['compressed']});
  const f=result.tempFiles[0];path=f.tempFilePath;size=f.size;
  const info=await Taro.getImageInfo({src:path});if(!['jpeg','jpg','png'].includes(info.type))throw Error('IMPORT_FORMAT_UNSUPPORTED');
  if(info.width*info.height>20000000)throw Error('IMPORT_IMAGE_TOO_LARGE');name=`image.${info.type==='png'?'png':'jpg'}`;
 }
 if(size>4*1024*1024)throw Error('IMPORT_FILE_TOO_LARGE');
 const data=await new Promise<string>((resolve,reject)=>fs().readFile({filePath:path,encoding:'base64',success:r=>resolve(r.data as string),fail:reject}));
 checkScope();
 const result=await api<{text:string;prepared_items?:any[];source:'image'|'file'}>(`/children/${child}/import-file`,'POST',{name,base64:data,existing_text:existingText,theme},undefined,60000);
 checkScope();return result;
}
export async function shareCsv(content:string){
 // A fixed private sandbox path avoids accumulating exports containing learning data.
 const path=`${Taro.env.USER_DATA_PATH}/wordmate-export.csv`;
 await new Promise<void>((resolve,reject)=>fs().writeFile({filePath:path,data:content,encoding:'utf8',success:()=>resolve(),fail:reject}));
 try{
  if(!Taro.canIUse('shareFileMessage'))throw Error('EXPORT_WECHAT_UPDATE_REQUIRED');
  await Taro.shareFileMessage({filePath:path,fileName:'单词本.csv'});
 }finally{try{fs().unlinkSync(path);}catch{}}
}
export const isFileCancel=(e:any)=>/cancel/i.test(e?.errMsg??e?.message??'');
