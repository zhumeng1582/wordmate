import Taro from '@tarojs/taro';
export type ShareTheme='growth'|'curiosity'|'perseverance'|'courage'|'discovery'|'calm';
export type ShareQuote={en:string;zh:string;theme?:ShareTheme};
export type ShareRecord={date:string;studied_words:number;goal:number;checked_in:boolean;streak_days:number;streak_through:string|null;quotes:ShareQuote[];copy_source:string;image?:{id:string;theme:ShareTheme;status:'pending'|'processing'|'succeeded'|'failed'}|null};
export function wrapText(text:string,width:number,measure:(s:string)=>number){
 const lines:string[]=[];let line='';
 const parts=/[\u4e00-\u9fff]/.test(text)?Array.from(text):text.split(/\s+/).map((x,i)=>(i?' ':'')+x);
 for(const part of parts){if(line&&measure(line+part)>width){lines.push(line.trim());line=part.trimStart();}else line+=part;}
 if(line)lines.push(line.trim());return lines;
}
async function sampleIsDark(canvasId:string,x:number,y:number,width:number,height:number){
 const api=Taro as unknown as {canvasGetImageData?:(options:Record<string,unknown>)=>Promise<{data:ArrayLike<number>}>};
 if(!api.canvasGetImageData)return false;
 try{
  const image=await api.canvasGetImageData({canvasId,x,y,width,height});
  const pixels=image.data;let luminance=0,count=0;
  for(let i=0;i+2<pixels.length;i+=4){luminance+=(0.2126*pixels[i]+0.7152*pixels[i+1]+0.0722*pixels[i+2]);count++;}
  return count>0&&luminance/count<145;
 }catch{return false;}
}
export async function renderSharePoster(canvasId:string,data:ShareRecord,quote:ShareQuote,cover=false,background:string){
 const width=600,height=cover?480:800,ctx=Taro.createCanvasContext(canvasId);
 const text=(s:string,x:number,y:number,size:number,color='#102f25',weight='500')=>{ctx.font=`${weight} ${size}px sans-serif`;const dark=color==='#f7f7ef';ctx.setFillStyle(dark?'rgba(12,34,27,0.82)':'rgba(255,255,255,0.82)');for(const dx of [-1,0,1])for(const dy of [-1,0,1])if(dx||dy)ctx.fillText(s,x+dx,y+dy);ctx.setFillStyle(color);ctx.fillText(s,x,y);};
 const paragraph=(s:string,y:number,size:number,color:string)=>{ctx.setFontSize(size);const lines=wrapText(s,504,t=>ctx.measureText(t).width);for(const line of lines){text(line,48,y,size,color);y+=size*1.45;}return y;};
 ctx.setFillStyle('#f4f6ef');ctx.fillRect(0,0,width,height);
 if(cover)ctx.drawImage(background,0,240,900,720,0,0,width,height);
 else ctx.drawImage(background,0,0,width,height);
 // Render the background first so each text region can choose a contrasting color.
 await new Promise<void>(resolve=>ctx.draw(false,resolve));
 const [headerDark,quoteDark,statsDark]=await Promise.all([
  sampleIsDark(canvasId,24,cover?10:10,552,cover?70:100),
  sampleIsDark(canvasId,24,cover?130:210,552,cover?145:285),
  sampleIsDark(canvasId,24,cover?300:540,552,cover?170:245)
 ]);
 // Redraw the image in the final pass instead of relying on canvas reserve semantics,
 // which are inconsistent across mini-program preview runtimes.
 ctx.setFillStyle('#f4f6ef');ctx.fillRect(0,0,width,height);
 if(cover)ctx.drawImage(background,0,240,900,720,0,0,width,height);
 else ctx.drawImage(background,0,0,width,height);
 const ink=(dark:boolean)=>dark?'#f7f7ef':'#102f25';
 const subInk=(dark:boolean)=>dark?'#f7f7ef':'#244b3b';
 text('单词共学',48,cover?42:58,cover?23:29,ink(headerDark),'600');
 text('每天一点，记得更牢',48,cover?66:91,cover?17:20,subInk(headerDark),'600');
 text(data.date,cover?438:438,cover?44:59,18,subInk(headerDark),'600');
 let englishSize=cover?20:28,chineseSize=cover?17:23;
 const blockHeight=()=>{ctx.setFontSize(englishSize);const en=wrapText(quote.en,504,t=>ctx.measureText(t).width).length*englishSize*1.4;ctx.setFontSize(chineseSize);return en+wrapText(quote.zh,504,t=>ctx.measureText(t).width).length*chineseSize*1.45+(cover?8:18);};
 const quoteLimit=cover?150:250;while(blockHeight()>quoteLimit&&englishSize>14){englishSize--;chineseSize--;}
 const y=paragraph(quote.en,cover?174:262,englishSize,ink(quoteDark));
 paragraph(quote.zh,y+(cover?8:18),chineseSize,subInk(quoteDark));
 const statusY=cover?322:570,numY=cover?400:676,smallY=cover?390:661,streakY=cover?442:738;
 text(data.checked_in?'今日打卡完成':'今日学习记录',48,statusY,cover?18:22,ink(statsDark),'600');
 text(String(data.studied_words),48,numY,cover?64:88,statsDark?'#f7f7ef':'#103d2e','600');
 text('个单词',cover?166:184,smallY,cover?20:24,subInk(statsDark),'600');
 text(`目标 ${data.goal} 个`,cover?300:324,smallY,cover?19:23,subInk(statsDark),'600');
 text(`连续打卡 ${data.streak_days} 天`,48,streakY,cover?18:20,subInk(statsDark),'600');
 return new Promise<string>((resolve,reject)=>ctx.draw(false,()=>{Taro.canvasToTempFilePath({canvasId,width,height,destWidth:width*2,destHeight:height*2,fileType:'png'}).then(r=>resolve(r.tempFilePath)).catch(reject);}));
}
