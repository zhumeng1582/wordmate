import Taro from '@tarojs/taro';
export type ShareQuote={en:string;zh:string};
export type ShareRecord={date:string;studied_words:number;goal:number;checked_in:boolean;streak_days:number;streak_through:string|null;quotes:ShareQuote[];copy_source:string};
export function wrapText(text:string,width:number,measure:(s:string)=>number){
 const lines:string[]=[];let line='';
 const parts=/[\u4e00-\u9fff]/.test(text)?Array.from(text):text.split(/\s+/).map((x,i)=>(i?' ':'')+x);
 for(const part of parts){if(line&&measure(line+part)>width){lines.push(line.trim());line=part.trimStart();}else line+=part;}
 if(line)lines.push(line.trim());return lines;
}
export async function renderSharePoster(canvasId:string,data:ShareRecord,quote:ShareQuote,cover=false){
 const width=600,height=cover?480:800,ctx=Taro.createCanvasContext(canvasId);
 const text=(s:string,x:number,y:number,size:number,color='#203e34')=>{ctx.setFillStyle(color);ctx.setFontSize(size);ctx.fillText(s,x,y);};
 const paragraph=(s:string,y:number,size:number,color:string)=>{ctx.setFontSize(size);const lines=wrapText(s,504,t=>ctx.measureText(t).width);for(const line of lines){text(line,48,y,size,color);y+=size*1.45;}return y;};
 ctx.setFillStyle('#f7f8f2');ctx.fillRect(0,0,width,height);
 ctx.setFillStyle('#e8f1e4');ctx.fillRect(24,cover?88:112,552,cover?150:218);
 text('单词共学',48,cover?40:56,26);text(data.date,420,cover?40:56,18,'#67796e');
 text(data.checked_in?'打卡成功':'今日学习记录',48,cover?120:154,22,'#255d48');
 text(String(data.studied_words),48,cover?194:254,cover?66:88,'#255d48');text(`个单词  /  目标 ${data.goal} 个`,cover?200:210,cover?190:250,22,'#527563');
 text(`截至当天连续打卡 ${data.streak_days} 天`,48,cover?226:303,20,'#527563');
 let englishSize=cover?23:29,chineseSize=cover?20:24;
 const blockHeight=()=>{ctx.setFontSize(englishSize);const en=wrapText(quote.en,504,t=>ctx.measureText(t).width).length*englishSize*1.45;ctx.setFontSize(chineseSize);return en+wrapText(quote.zh,504,t=>ctx.measureText(t).width).length*chineseSize*1.45+(cover?8:18);};
 while(blockHeight()>(cover?192:280)&&englishSize>14){englishSize--;chineseSize--;}
 const y=paragraph(quote.en,cover?266:402,englishSize,'#203e34');
 paragraph(quote.zh,y+(cover?8:18),chineseSize,'#67796e');
 if(!cover){text('每天一点，记得更牢',48,722,20,'#527563');text( data.copy_source==='ai'?'AI 原创鼓励语 · 中英双语':'精选鼓励语 · 中英双语',48,758,16,'#67796e');}
 return new Promise<string>((resolve,reject)=>ctx.draw(false,()=>{Taro.canvasToTempFilePath({canvasId,width,height,destWidth:width*2,destHeight:height*2,fileType:'png'}).then(r=>resolve(r.tempFilePath)).catch(reject);}));
}
