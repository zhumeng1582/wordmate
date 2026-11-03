export type PrefetchWord={word_id:string;content_version:number};
type Preferences={accent:string;voice_id:string|null};
type Dependencies={api:(path:string,method?:'GET'|'POST',body?:any,key?:string)=>Promise<any>;eventId:()=>string;preferences:()=>Promise<Preferences>;scope:()=>string;child:()=>string;wait?:(ms:number)=>Promise<void>};

// One background request at a time keeps speculative jobs from filling the TTS queue.
export class AudioPrefetch {
 private desired:PrefetchWord[]=[];private completed=new Set<string>();private running=false;private epoch=0;
 private deps:Dependencies;
 constructor(deps:Dependencies){this.deps=deps;}
 stop(){this.epoch++;this.desired=[];this.completed.clear();}
 setWords(words:PrefetchWord[]){
  const unique=new Map<string,PrefetchWord>();for(const word of words.slice(0,3))if(word.word_id&&Number.isFinite(word.content_version))unique.set(JSON.stringify(word),word);
  this.desired=[...unique.values()];void this.work();
 }
 private async work(){
  if(this.running)return;this.running=true;
  try{while(this.desired.length){
   const epoch=this.epoch,scope=this.deps.scope(),word=this.desired.find(item=>!this.completed.has(JSON.stringify(item)));if(!word)break;
   const key=JSON.stringify(word),current=()=>epoch===this.epoch&&scope===this.deps.scope(),wanted=()=>this.desired.some(item=>JSON.stringify(item)===key);
   this.completed.add(key);
   try{
    const prefs=await this.deps.preferences();if(!current()||!wanted()||!prefs.voice_id)continue;
    const prepare=async(target:Record<string,unknown>)=>{
     if(!current()||!wanted())return;
     let job=await this.deps.api('/audio','POST',{...target,accent:prefs.accent,voice_id:prefs.voice_id,speech_rate:1},this.deps.eventId());
     const deadline=Date.now()+120000;
     while(current()&&['queued','running'].includes(job.status)&&Date.now()<deadline){await (this.deps.wait??(ms=>new Promise(resolve=>setTimeout(resolve,ms))))(2000);if(!current())return;job=await this.deps.api(`/jobs/${job.job_id}`);}
    };
    await prepare(word);if(!current()||!wanted())continue;
    const detail=await this.deps.api(`/children/${this.deps.child()}/words/${word.word_id}`);if(!current()||!wanted())continue;
    if(detail.example?.id&&Number.isFinite(detail.example.content_version))await prepare({sentence_id:detail.example.id,content_version:detail.example.content_version});
   }catch{/* Playback remains available and reports any errors when requested. */}finally{if(epoch===this.epoch&&!wanted())this.completed.delete(key);}
  }}finally{this.running=false;if(this.desired.some(item=>!this.completed.has(JSON.stringify(item))))void this.work();}
 }
}
