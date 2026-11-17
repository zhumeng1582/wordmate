import {strokeData} from './hanzi-strokes.ts';
import {number,label,pathFor,pdf,loadPinyinFont} from './print-pdf.ts';
type Entry={character:string;pinyin:string;words:string;strokes:number|null};
type Graphic={status:string;strokes?:string[]};
const clean=(s:string,max:number)=>{const value=String(s??'').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();return Array.from(value).slice(0,max).join('')+(Array.from(value).length>max?'…':'');};
const wrap=(text:string,width:number)=>{const chars=Array.from(text),lines:string[]=[];for(let i=0;i<chars.length;i+=width)lines.push(chars.slice(i,i+width).join(''));return lines.length?lines:[''];};
const grid=(x:number,y:number,size:number)=>{const a=number(x),b=number(y),s=number(size),mid=number(size/2);return `0.64 G 0.5 w [] 0 d ${a} ${b} ${s} ${s} re S\n0.82 G 0.35 w [2 2] 0 d ${number(x+size/2)} ${b} m ${number(x+size/2)} ${number(y+size)} l S ${a} ${number(y+size/2)} m ${number(x+size)} ${number(y+size/2)} l S [] 0 d\n`;};
/** A4 portrait. Allocate enough identical squares for strokes, one whole-character trace and three blanks. */
export async function renderHanziCopybook(entries:Entry[]){
 const font=await loadPinyinFont();
 const graphics=await Promise.all(entries.map(e=>strokeData(e.character,e.strokes) as Promise<Graphic>));
 const pages:string[]=[];let page='',top=0;
 // Fixed physical sizes: 14 mm pencil squares, 2.8 mm gaps, centered on A4.
 const left=50,right=595.28-left,bottom=50,columns=10,gap=8;
 const size=14*72/25.4,cell=size+gap,step=size+gap,gridLeft=(595.28-(columns*size+(columns-1)*gap))/2;
 const glyphSize=size*0.64,glyphInset=(size-glyphSize)/2;
 const titleY=841.89-50-17,ruleY=titleY-13;
 const newPage=()=>{if(page)pages.push(page);page=`0.1 g\n${label(left,titleY,17,'汉字练习字帖')}${label(right-178,titleY+2,10,'姓名：           日期：')}0.45 G 0.5 w ${left} ${number(ruleY)} m ${number(right)} ${number(ruleY)} l S\n`;page+=label(left,ruleY-17,9,'按笔顺描红，再在空格里独立书写。');top=ruleY-32;};newPage();
 entries.forEach((entry,index)=>{
  const g=graphics[index],paths=g.status==='available'?g.strokes??[]:[],lines=Math.max(1,Math.ceil((paths.length+4)/columns));
  const note=paths.length?'':g.status==='too_many'?'（笔画较多，省略笔顺）':'（暂无笔顺）';
  const captions=wrap(`拼音：${clean(entry.pinyin,200)||'待补充'}   ${clean(entry.words,18)||'待补充'}${note}`,44),headerHeight=34+(captions.length-1)*14,block=headerHeight+lines*step+18;if(top-block<bottom)newPage();
  page+=`0.1 g\n${label(left,top-18,17,entry.character)}`;captions.forEach((caption,i)=>{page+=label(left+28,top-17-i*14,10,caption);});top-=headerHeight;
  const full=(x:number,y:number)=>{let content='0.78 g\n';if(paths.length){const scale=number(glyphSize/1024);content+=`q ${scale} 0 0 ${scale} ${number(x+glyphInset)} ${number(y+glyphInset)} cm /G${index} Do Q\n`;}else content+=label(x+glyphInset,y+glyphInset,glyphSize,entry.character);return content;};
  // After the stroke sequence, fill the remaining slots with whole-character
  // tracing, leaving exactly the final three slots blank for independent practice.
  for(let i=0;i<lines*columns;i++){
   const row=Math.floor(i/columns),col=i%columns,x=gridLeft+col*cell,y=top-(row+1)*step;
   page+=grid(x,y,size);
   if(i<paths.length){for(let j=0;j<=i;j++)page+=`${j===i?'0.4':'0.78'} g\n`+pathFor(paths[j],x+glyphInset,y+glyphInset,glyphSize);}
   else if(i<lines*columns-3)page+=full(x,y);
  }
  top-=lines*step+18;page+='0.1 g\n';
 });pages.push(page);pages.forEach((_,i)=>{pages[i]+=`0.4 g\n${label(left,28,9,'A4 原始大小（100%）打印')}${label(right-70,28,9,`第 ${i+1} / ${pages.length} 页`)}`;});return pdf(pages,graphics.map(g=>g.status==='available'?g.strokes??[]:[]),font);
}
