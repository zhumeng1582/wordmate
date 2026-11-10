import {strokeData} from './hanzi-strokes.ts';
import {deflateSync} from 'node:zlib';

type Entry={character:string;pinyin:string;words:string;strokes:number|null};
type Graphic={status:string;strokes?:string[]};
const number=(n:number)=>Number(n.toFixed(3)).toString();
const hex=(s:string)=>Array.from(s).map(c=>c.codePointAt(0)!).filter(c=>c<=0xffff).map(c=>c.toString(16).padStart(4,'0')).join('').toUpperCase();
const clean=(s:string,max:number)=>{const value=String(s??'').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();return Array.from(value).slice(0,max).join('')+(Array.from(value).length>max?'…':'');};
const wrap=(text:string,width:number)=>{const chars=Array.from(text),lines:string[]=[];for(let i=0;i<chars.length;i+=width)lines.push(chars.slice(i,i+width).join(''));return lines.length?lines:[''];};
const label=(x:number,y:number,size:number,text:string)=>`BT /C ${number(size)} Tf ${number(x)} ${number(y)} Td <${hex(text)}> Tj ET\n`;
const grid=(x:number,y:number,size:number)=>{const a=number(x),b=number(y),s=number(size),mid=number(size/2);return `0.72 G 0.5 w [] 0 d ${a} ${b} ${s} ${s} re S\n0.78 G 0.35 w [2 2] 0 d ${number(x+size/2)} ${b} m ${number(x+size/2)} ${number(y+size)} l S ${a} ${number(y+size/2)} m ${number(x+size)} ${number(y+size/2)} l S [] 0 d\n`;};
// Convert the corpus' SVG outlines to PDF paths, including quadratic curves.
function pathFor(source:string,x:number,y:number,size:number){
 const tokens=source.match(/[MLQCZ]|-?\d+(?:\.\d+)?/g)||[];let i=0,op='',cx=0,cy=0;let out='';const pt=(a:number,b:number)=>[x+a*size/1024,y+(b+124)*size/1024];
 while(i<tokens.length){if(/^[MLQCZ]$/.test(tokens[i]))op=tokens[i++];if(op==='Z'){out+='h\n';op='';continue;}const count=op==='M'||op==='L'?2:op==='Q'?4:op==='C'?6:0;if(!count||i+count>tokens.length)throw Error('INVALID_STROKE_PATH');const v=tokens.slice(i,i+count).map(Number);i+=count;
  if(op==='M'||op==='L'){const [a,b]=pt(v[0],v[1]);out+=`${number(a)} ${number(b)} ${op==='M'?'m':'l'}\n`;cx=a;cy=b;if(op==='M')op='L';}
  else if(op==='Q'){const [ax,ay]=pt(v[0],v[1]),[bx,by]=pt(v[2],v[3]);out+=`${number(cx+2*(ax-cx)/3)} ${number(cy+2*(ay-cy)/3)} ${number(bx+2*(ax-bx)/3)} ${number(by+2*(ay-by)/3)} ${number(bx)} ${number(by)} c\n`;cx=bx;cy=by;}
  else{const [ax,ay]=pt(v[0],v[1]),[bx,by]=pt(v[2],v[3]),[dx,dy]=pt(v[4],v[5]);out+=`${number(ax)} ${number(ay)} ${number(bx)} ${number(by)} ${number(dx)} ${number(dy)} c\n`;cx=dx;cy=dy;}
 }
 return out+'f\n';
}
function pdf(pages:string[],forms:string[][]){
 const objects:string[]=[];const add=(s:string)=>{objects.push(s);return objects.length;};
 add('<< /Type /Catalog /Pages 2 0 R >>');add('');add('<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>');add('<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> >>');
 const formIds=forms.map(paths=>{if(!paths.length)return 0;const data=paths.map(p=>pathFor(p,0,0,1024)).join(''),compressed=deflateSync(Buffer.from(data,'ascii'));return add(`<< /Type /XObject /Subtype /Form /BBox [0 0 1024 1024] /Resources << >> /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n${compressed.toString('latin1')}\nendstream`);});const xobjects=formIds.map((id,i)=>id?`/G${i} ${id} 0 R`:'').filter(Boolean).join(' ');
 const ids:number[]=[];for(const page of pages){const compressed=deflateSync(Buffer.from(page,'ascii'));const content=add(`<< /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n${compressed.toString('latin1')}\nendstream`);ids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /C 3 0 R >> /XObject << ${xobjects} >> >> /Contents ${content} 0 R >>`));}objects[1]=`<< /Type /Pages /Count ${ids.length} /Kids [${ids.map(i=>`${i} 0 R`).join(' ')}] >>`;
 let out='%PDF-1.4\n%WORDMATE\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out,'latin1'));out+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(out,'latin1');out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(out,'latin1');
}
/** A4 portrait. Allocate enough identical squares for strokes, one whole-character trace and three blanks. */
export async function renderHanziCopybook(entries:Entry[]){
 const graphics=await Promise.all(entries.map(e=>strokeData(e.character,e.strokes) as Promise<Graphic>));
 const pages:string[]=[];let page='',top=0;const left=30,columns=15,cell=535/columns,step=38.7;
 const newPage=()=>{if(page)pages.push(page);page=`0.1 g\n${label(left,810,15,'汉字练习字帖')}${label(420,812,9,'姓名：           日期：')}0.45 G 0.5 w ${left} 800 m 565 800 l S\n`;top=786;};newPage();
 entries.forEach((entry,index)=>{
  const g=graphics[index],paths=g.status==='available'?g.strokes??[]:[],lines=Math.max(1,Math.ceil((paths.length+4)/columns));
  const note=paths.length?'':g.status==='too_many'?'（笔画较多，省略笔顺）':'（暂无笔顺）';
  const captions=wrap(`拼音：${clean(entry.pinyin,200)||'待补充'}   ${clean(entry.words,18)||'待补充'}${note}`,48),headerHeight=29+(captions.length-1)*13,block=headerHeight+lines*step+13;if(top-block<34)newPage();
  page+=`0.1 g\n${label(left,top-16,15,entry.character)}`;captions.forEach((caption,i)=>{page+=label(left+24,top-15-i*13,9,caption);});top-=headerHeight;
  const full=(x:number,y:number,size:number)=>{let content='0.8 g\n';if(paths.length){const scale=number((size-8)/1024);content+=`q ${scale} 0 0 ${scale} ${number(x+4)} ${number(y+4)} cm /G${index} Do Q\n`;}else content+=label(x+size*0.14,y+size*0.14,size*0.72,entry.character);return content;};
  // After the stroke sequence, fill the remaining slots with whole-character
  // tracing, leaving exactly the final three slots blank for independent practice.
  for(let i=0;i<lines*columns;i++){
   const row=Math.floor(i/columns),col=i%columns,x=left+col*cell,y=top-(row+1)*step,size=cell-3;
   page+=grid(x,y,size);
   if(i<paths.length){for(let j=0;j<=i;j++)page+=`${j===i?'0.63':'0.84'} g\n`+pathFor(paths[j],x+4,y+4,size-8);}
   else if(i<lines*columns-3)page+=full(x,y,size);
  }
  top-=lines*step+13;page+='0.1 g\n';
 });pages.push(page);return pdf(pages,graphics.map(g=>g.status==='available'?g.strokes??[]:[]));
}
