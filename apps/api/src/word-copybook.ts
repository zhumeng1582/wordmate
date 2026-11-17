import {label,number,pdf,loadPinyinFont} from './print-pdf.ts';
/** A4 pencil practice: one model per word, with open four-line space to its right. */
export async function renderWordCopybook(words:string[]){
 const font=await loadPinyinFont(),pages:string[]=[],left=44,right=551.28,size=19,width=right-left-12;let page='',baseline=724;
 const newPage=()=>{if(page)pages.push(page);page=`0.12 g\n${label(left,792,17,'英语单词练习字帖')}${label(left,771,9,'姓名：               日期：')}\n`;baseline=724;};
 const row=(text:string)=>{if(baseline<68)newPage();for(const [offset,gray,dash] of [[18,0.72,false],[9,0.82,true],[0,0.62,false],[-9,0.72,false]] as const)page+=`${gray} G 0.4 w ${dash?'[2 2]':'[]'} 0 d ${left} ${number(baseline+offset)} m ${right} ${number(baseline+offset)} l S\n`;page+=`[] 0 d 0.2 g\n${label(left+6,baseline,size,text)}`;baseline-=54;};
 const measure=(text:string)=>Array.from(text).reduce((sum,c)=>sum+(font.metrics.glyphs[c.codePointAt(0)!]?.[1]??1000)*size/1000,0);newPage();
 for(const word of words){let line='';const text=String(word).normalize('NFC').replace(/\s+/g,' ').trim();for(const token of text.match(/[A-Za-z0-9’'-]+|./gu)??[]){for(const part of measure(token)>width?Array.from(token):[token]){if(line&&measure(line+part)>width){row(line);line='';}line+=part;}}if(line)row(line);}
 pages.push(page);pages.forEach((_,i)=>{pages[i]+=`0.4 g\n${label(left,28,9,'A4 原始大小（100%）打印')}${label(right-75,28,9,`第 ${i+1} / ${pages.length} 页`)}`;});return pdf(pages,[],font);
}
