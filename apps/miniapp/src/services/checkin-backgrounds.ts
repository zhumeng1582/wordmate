export const CHECKIN_BACKGROUND_IDS=['01-lake','02-ocean-sunrise','03-cloud-sky','04-desert','05-deep-sea','06-forest-path','07-mountain-valley','08-snow-mountain','09-river-canyon','10-island-bay'];
/** Temporary files belong to one sharing page and are never included in the miniapp. */
export class CheckinBackgroundLoader {
 private files=new Map<string,string>();private generation=0;
 private taro:any;private apiBase:string;
 constructor(taro:any,apiBase:string){this.taro=taro;this.apiBase=apiBase;}
 private remove(path:string){this.taro.getFileSystemManager().unlink({filePath:path,fail:()=>{}});}
 clear(){this.generation++;for(const path of this.files.values())this.remove(path);this.files.clear();}
 async load(id:string,token:string,active:()=>boolean):Promise<string|null>{
  if(!CHECKIN_BACKGROUND_IDS.includes(id))throw Error('无效的分享背景');
  const generation=this.generation,valid=()=>generation===this.generation&&active();
  const formats=this.taro.getDeviceInfo?.().platform==='ios'?['jpg']:['webp','jpg'];
  for(const format of formats){
   if(!valid())return null;const key=`${id}.${format}`;let file=this.files.get(key);
   if(file){try{await this.taro.getImageInfo({src:file});return valid()?file:null;}catch{this.files.delete(key);this.remove(file);}}
   if(!valid())return null;
   try{
    const response=await this.taro.downloadFile({url:`${this.apiBase}/checkin-backgrounds/${id}/${format}`,header:{Authorization:`Bearer ${token}`},timeout:30000});file=response.tempFilePath;
    if(!valid()){if(file)this.remove(file);return null;}
    if(response.statusCode!==200||!file){if(file)this.remove(file);file=undefined;if(response.statusCode===401||response.statusCode===403)throw Error('SHARE_AUTH_REQUIRED');continue;}
    const info=await this.taro.getImageInfo({src:file});
    if(!valid()){this.remove(file);return null;}
    if(info.width<900||info.height<1600)throw Error('INVALID_BACKGROUND_SIZE');
    this.files.set(key,file);while(this.files.size>3){const [old,path]=this.files.entries().next().value!;this.files.delete(old);this.remove(path);}
    return file;
   }catch(error){if(file)this.remove(file);if(!valid())return null;if((error as Error).message==='SHARE_AUTH_REQUIRED')throw Error('登录已失效，请重新登录后生成分享图。');}
  }
  throw Error('高清背景加载失败，请检查网络后重试。');
 }
}
