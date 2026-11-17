export type HanziSpeechTarget={id:string;part:'character'|'example';content:string};
export type HanziSpeechState={target:HanziSpeechTarget|null;status:string;busy:boolean;error:string};
type Store={get:(key:string)=>any;set:(key:string,value:any)=>void};
type Request=(path:string,method?:any,body?:any,key?:any,timeout?:number)=>Promise<any>;

/** One player per page. All synthesis is user initiated and scoped to its owner. */
export class HanziSpeech {
 state:HanziSpeechState={target:null,status:'',busy:false,error:''};
 private listeners=new Set<(state:HanziSpeechState)=>void>();
 private sequence=0;private visible=true;private disposed=false;private player:any=null;
 private files=new Map<string,string>();private owner='';
 private taro:any;private request:Request;private store:Store;private errorText:(error:any)=>string;private apiBase:string;
 constructor(taro:any,request:Request,store:Store,errorText:(error:any)=>string,apiBase:string){this.taro=taro;this.request=request;this.store=store;this.errorText=errorText;this.apiBase=apiBase;this.owner=this.identity();}
 private identity(){return [this.store.get('access_token'),this.store.get('child_id'),this.store.get('family_id')].join(':');}
 private emit(patch:Partial<HanziSpeechState>){this.state={...this.state,...patch};for(const listener of this.listeners)listener(this.state);}
 subscribe(listener:(state:HanziSpeechState)=>void){this.listeners.add(listener);listener(this.state);return ()=>{this.listeners.delete(listener);};}
 private remove(path:string){this.taro.getFileSystemManager().unlink({filePath:path,fail:()=>{}});}
 stop(){this.sequence++;if(this.player){this.player.stop();this.player.destroy();this.player=null;}this.emit({target:null,status:'',busy:false,error:''});}
 private clear(){this.stop();for(const path of this.files.values())this.remove(path);this.files.clear();}
 show(){if(this.disposed)return;this.visible=true;if(this.owner!==this.identity()){this.clear();this.owner=this.identity();}}
 hide(){this.visible=false;this.stop();}
 dispose(){this.visible=false;this.disposed=true;this.clear();this.listeners.clear();}
 async play(target:HanziSpeechTarget){
  if(this.disposed||!this.visible||!target.id||!target.content.trim()||this.state.busy)return;
  if(this.owner!==this.identity()){this.clear();return;}
  const same=this.state.target?.id===target.id&&this.state.target.part===target.part&&this.state.target.content===target.content;
  if(same&&this.player){if(this.state.status==='正在播放'){this.player.pause();this.emit({status:'已暂停'});}else{this.player.play();this.emit({status:'正在播放'});}return;}
  this.stop();const ticket=this.sequence,owner=this.identity(),account=String(this.store.get('access_token')),child=String(this.store.get('child_id')),family=String(this.store.get('family_id'));
  const valid=()=>!this.disposed&&this.visible&&ticket===this.sequence&&owner===this.identity();
  if(!account||!child)return;
  this.emit({target,status:'正在准备朗读…',busy:true,error:''});
  try{
   const cacheKey=JSON.stringify([owner,target.id,target.part,target.content]);let file=this.files.get(cacheKey);
   if(!file){
    const settings=await this.request(`/me/ai-settings?family_id=${encodeURIComponent(family)}`);if(!valid())return;
    const price=settings.audio_yuan_per_10000_characters;if(!price)throw Error('AUDIO_PRICE_NOT_CONFIGURED');
    const notice=`hanzi_audio_notice:${account}:${child}`;
    if(!this.store.get(notice)){
     const consent=await this.taro.showModal({title:'汉字朗读',content:`朗读使用普通话语音。首次生成或修改文字后重新生成将使用家庭额度，语音价格为 ¥${price}/万字符；同一内容可重复播放。多音字请结合拼音和例句核对。`,confirmText:'继续'});
     if(!valid())return;if(!consent.confirm){this.stop();return;}this.store.set(notice,true);
    }
    const result=await this.request(`/children/${child}/hanzi/${encodeURIComponent(target.id)}/audio/${target.part}`,'POST',{},undefined,120000);if(!valid())return;
    this.emit({status:'正在加载音频…'});
    const downloaded=await this.taro.downloadFile({url:this.apiBase+result.resource_path,header:{Authorization:`Bearer ${account}`},timeout:30000});
    if(!valid()||downloaded.statusCode!==200){if(downloaded.tempFilePath)this.remove(downloaded.tempFilePath);if(valid())throw Error('AUDIO_DOWNLOAD_FAILED');return;}
    file=downloaded.tempFilePath;this.files.set(cacheKey,file!);
    while(this.files.size>8){const first=this.files.entries().next().value!;this.files.delete(first[0]);this.remove(first[1]);}
   }
   await this.taro.setInnerAudioOption({obeyMuteSwitch:false,mixWithOther:false});if(!valid())return;
   const player=this.taro.createInnerAudioContext();this.player=player;player.src=file;
   player.onEnded(()=>{if(valid())this.stop();});player.onError(()=>{if(valid()){this.stop();const bad=this.files.get(cacheKey);this.files.delete(cacheKey);if(bad)this.remove(bad);this.emit({error:'朗读播放失败，请点击发音重试。'});}});
   player.play();this.emit({status:'正在播放'});
  }catch(error){if(valid()){this.stop();this.emit({error:this.errorText(error)});}}
  finally{if(valid())this.emit({busy:false});}
 }
}
