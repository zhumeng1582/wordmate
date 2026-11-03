import Taro from '@tarojs/taro';
import {api,storage} from './api';
const fs=()=>Taro.getFileSystemManager();
type MaterialKind='camera'|'album'|'file';
function chooseMaterial(kind:MaterialKind){
 return new Promise<{tempFiles?:any[]}>((resolve,reject)=>{
  // Settle from native callbacks too: cancellation must not depend on the
  // returned Promise being forwarded by the picker on every WeChat version.
  const complete=(result:any)=>{
   if(result?.tempFiles)resolve(result);
   else reject(result?.errMsg&&!/:\s*ok$/i.test(result.errMsg)?result:Error('IMPORT_CANCELLED'));
  };
  const callbacks={success:resolve,fail:reject,complete};
  const request=kind==='file'
   ?Taro.chooseMessageFile({count:1,type:'file',extension:['txt','md','csv','tsv','xlsx','docx'],...callbacks})
   :Taro.chooseMedia({count:1,mediaType:['image'],sourceType:[kind],sizeType:['compressed'],...callbacks});
  request?.then(resolve,reject);
 });
}
export async function extractFile(child:string,kind:MaterialKind,existingText='',theme='',onSelected?:()=>void){
 const token=storage.get('access_token'),selectedChild=storage.get('child_id'),family=storage.get('family_id');
 const checkScope=()=>{if(token!==storage.get('access_token')||selectedChild!==storage.get('child_id')||family!==storage.get('family_id'))throw Error('SESSION_CHANGED');};
 if(Taro.canIUse('requirePrivacyAuthorize'))await new Promise<void>((resolve,reject)=>Taro.requirePrivacyAuthorize({success:()=>resolve(),fail:()=>reject(Error('IMPORT_PRIVACY_REQUIRED'))}));
 checkScope();
 const result=await chooseMaterial(kind),file=result?.tempFiles?.[0];
 if(!file||!(kind==='file'?file.path:file.tempFilePath))throw Error('IMPORT_CANCELLED');
 checkScope();
 let path:string,name:string,size:number;
 if(kind==='file'){
  path=file.path;name=file.name;size=file.size;
 }else{
  path=file.tempFilePath;size=file.size;
  const info=await Taro.getImageInfo({src:path});if(!['jpeg','jpg','png'].includes(info.type))throw Error('IMPORT_FORMAT_UNSUPPORTED');
  if(info.width*info.height>20000000)throw Error('IMPORT_IMAGE_TOO_LARGE');name=`image.${info.type==='png'?'png':'jpg'}`;
 }
 if(size>4*1024*1024)throw Error('IMPORT_FILE_TOO_LARGE');
 checkScope();onSelected?.();
 const data=await new Promise<string>((resolve,reject)=>fs().readFile({filePath:path,encoding:'base64',success:r=>resolve(r.data as string),fail:reject}));
 checkScope();
 const separateImage=kind!=='file'&&existingText.length>8000;
 const material=await api<{text:string;prepared_items?:any[];source:'image'|'file'}>(`/children/${child}/import-file`,'POST',{name,base64:data,existing_text:separateImage?'':existingText,theme},undefined,60000);
 checkScope();return separateImage?{...material,text:[existingText.trim(),material.text].filter(Boolean).join('\n'),prepared_items:undefined}:material;
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
export const isFileCancel=(e:any)=>/cancel/i.test(typeof e==='string'?e:e?.errMsg??e?.message??'');
