// Only explicit poem boundaries may split material. Never splice poem fragments
// or infer missing verses from overlapping model output.
const limit=6000;
const sections=/^(?:作者|朝代|正文|原文|诗文|注释|注解|译文|翻译|背景|创作背景|出处|备注|拼音|说明|注|译)(?:[：:]|$)/;
const failure=(code:string,message:string)=>Object.assign(new Error(message),{code});
export function poemImportEntries(raw:string):string[]{
 const starts:number[]=[],compact:number[]=[],separators:number[]=[];let offset=0,fence='',nonempty=0;
 const lines=raw.split(/(?<=\n)/);
 for(const [index,line] of lines.entries()){
  const text=line.trim(),marker=text.match(/^(`{3,}|~{3,})/);
  if(text)nonempty++;
  if(marker){if(!fence)fence=marker[1][0];else if(marker[1][0]===fence)fence='';offset+=line.length;continue;}
  if(!fence){
   const heading=text.replace(/^#{1,6}\s+|^\d+[.)、]\s+/,'').replace(/^\*\*(.*?)\*\*$/,'$1');
   let nextIndex=index+1;if(text)while(nextIndex<lines.length&&!lines[nextIndex].trim())nextIndex++;
   const next=lines[nextIndex]?.trim()??'';
   const title=/^(?:标题|题目)\s*[：:]\s*\S/.test(text)||/^[《〈][^《》〈〉\n]{1,100}[》〉]$/.test(heading)||
    heading!==text&&heading.length<=100&&!sections.test(heading)&&!/[：:，。！？；]/.test(heading)||
    /^[^：:，。！？；]{1,100}$/.test(text)&&/^(?:作者|朝代|正文|原文|诗文)\s*[：:]/.test(next);
   if(title)starts.push(offset);
   if(!sections.test(text)&&/^[^：:，。！？；]{1,100}[：:][^\n]*[，。！？；]/.test(text))compact.push(offset);
   if(/^---+\s*$/.test(text))separators.push(offset+line.length);
  }
  offset+=line.length;
 }
 // Inline "title: verse" is safe only for a dense list consisting entirely of
 // such rows. A colon inside unlabelled annotations is not a poem boundary.
 if(!starts.length&&compact.length===nonempty)starts.push(...compact);
 starts.push(...separators);
 const boundaries=[...new Set([0,...starts.filter(n=>n>0&&n<raw.length),raw.length])].sort((a,b)=>a-b);
 return boundaries.slice(0,-1).map((start,i)=>raw.slice(start,boundaries[i+1]));
}
export function poemImportChunks(raw:string):string[]{
 const entries=poemImportEntries(raw),chunks:string[]=[];let group='';
 for(const entry of entries){
  if(entry.length>limit){const unknown=entries.length===1&&!/^(?:\s*(?:标题|题目)\s*[：:]|\s*[《〈#])/.test(raw);throw failure(unknown?'POEM_BOUNDARY_REQUIRED':'POEM_ENTRY_TOO_LONG',unknown?'长材料无法确定诗词边界，请用“标题：”或《诗名》标明每首诗后重试。':'有一首诗或说明超过 6000 字，请缩短该首附带资料后重试。');}
  if(group.length+entry.length>limit){chunks.push(group);group='';}group+=entry;
 }
 if(group)chunks.push(group);return chunks;
}
export function splitPoemImportChunk(raw:string):string[]|null{
 const entries=poemImportEntries(raw);if(entries.length<2)return null;
 let cut=0,best=0,distance=Infinity;
 for(const entry of entries.slice(0,-1)){cut+=entry.length;const d=Math.abs(raw.length/2-cut);if(d<distance&&raw.slice(0,cut).trim()&&raw.slice(cut).trim()){best=cut;distance=d;}}
 return best?[raw.slice(0,best),raw.slice(best)]:null;
}
