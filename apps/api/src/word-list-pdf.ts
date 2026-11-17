import {shortPos} from './word-pos.ts';
export {shortPos} from './word-pos.ts';
import {label,pdf,loadPinyinFont} from './print-pdf.ts';
type Word={lemma:string;part_of_speech:string;meaning_zh:string;example?:{text_en?:string;translation_zh?:string}|null};
const clean=(s:string)=>String(s??'').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
// Conservative Latin widths leave room for the embedded font; Chinese uses one em.
function wrap(text:string,size:number,width:number){
 const lines:string[]=[];let line='',used=0;
 const measure=(value:string)=>Array.from(value).reduce((sum,char)=>sum+(char.charCodeAt(0)>0x250?1:char===' '?0.35:0.65)*size,0);
 for(const token of clean(text).match(/[A-Za-z0-9’'-]+|./gu)??[]){
  for(const part of measure(token)>width?Array.from(token):[token]){const w=measure(part);if(used+w>width&&line){lines.push(line);line='';used=0;}line+=part;used+=w;}
 }
 if(line)lines.push(line);return lines;
}
export async function renderWordListPdf(words:Word[]){
 const font=await loadPinyinFont();
 const measure=(text:string,size:number)=>Array.from(text).reduce((sum,char)=>sum+(font.metrics.glyphs[char.codePointAt(0)!]?.[1]??1000)*size/1000,0);
 const pages:string[]=[],left=44,right=551.28,gap=28,width=(right-left-gap)/2,top=748,bottom=54;let page='',y=top,col=0;
 const newPage=()=>{if(page)pages.push(page);page=`0.12 g\n${label(left,792,17,'单词学习清单')}${label(left,771,9,`共 ${words.length} 个单词 · 姓名：               日期：`)}`;col=0;y=top;};
 const advance=()=>{if(col===0){col=1;y=top;}else newPage();};newPage();
 words.forEach(word=>{
  const lemma=clean(word.lemma),summary=[shortPos(word.part_of_speech),clean(word.meaning_zh)].filter(Boolean).join(' '),title=wrap(lemma,13,width),inline=title.length===1&&!!summary&&measure(lemma,13)+8+measure(summary,10)<=width;
  const lines:{text:string;size:number;height:number;tail?:string;tailX?:number}[]=[...title.map(text=>({text,size:13,height:19})),...(!inline?wrap(summary,10,width).map(text=>({text,size:10,height:15})):[]),...wrap(word.example?.text_en??'',10,width).map((text,i)=>({text,size:10,height:i===0?19:15})),...wrap(word.example?.translation_zh??'',10,width).map(text=>({text,size:10,height:15}))];
  if(inline){lines[0].tail=summary;lines[0].tailX=measure(lemma,13)+8;}
  const height=lines.reduce((sum,l)=>sum+l.height,0)+14;
  if(y<top&&y-Math.min(height,top-bottom)<bottom)advance();
  for(const line of lines){if(y-line.height<bottom)advance();y-=line.height;page+=`0.12 g\n${label(left+col*(width+gap),y,line.size,line.text)}${line.tail?label(left+col*(width+gap)+line.tailX!,y,10,line.tail):''}`;}
  y-=14;
 });pages.push(page);
 pages.forEach((_,i)=>{pages[i]+=`0.4 g\n${label(left,28,9,'A4 原始大小（100%）打印')}${label(right-75,28,9,`第 ${i+1} / ${pages.length} 页`)}`;});
 return pdf(pages,[],font);
}
