import {useEffect,useState} from 'react';
import Taro from '@tarojs/taro';
import {Canvas,Text,View} from '@tarojs/components';
import {api} from '../../services/api';

type Result={status:'available'|'unavailable'|'too_many'|'mismatch';strokes?:string[]};

// Make Me a Hanzi paths contain absolute M/L/Q/C/Z commands in a 1024-unit grid.
export function drawStroke(ctx:any,path:string,x:number,y:number,size:number){
 const tokens=path.match(/[MLQCZ]|-?\d+(?:\.\d+)?/g)||[];let i=0,op='';
 const px=(n:number)=>x+n*size/1024,py=(n:number)=>y+(900-n)*size/1024;
 ctx.beginPath();
 while(i<tokens.length){if(/^[MLQCZ]$/.test(tokens[i]))op=tokens[i++];if(op==='Z'){ctx.closePath();op='';continue;}
  const count=op==='M'||op==='L'?2:op==='Q'?4:op==='C'?6:0;if(!count||i+count>tokens.length)throw Error('INVALID_STROKE_PATH');
  const n=tokens.slice(i,i+count).map(Number);i+=count;
  if(op==='M'){ctx.moveTo(px(n[0]),py(n[1]));op='L';}else if(op==='L')ctx.lineTo(px(n[0]),py(n[1]));else if(op==='Q')ctx.quadraticCurveTo(px(n[0]),py(n[1]),px(n[2]),py(n[3]));else ctx.bezierCurveTo(px(n[0]),py(n[1]),px(n[2]),py(n[3]),px(n[4]),py(n[5]));
 }
 ctx.fill();
}

export function HanziStrokes({child,id,character,strokes}:{child:string;id:string;character:string;strokes:number|null}){
 const [result,setResult]=useState<Result|null>(null),[failed,setFailed]=useState(false);
 const width=Math.max(200,Math.min(360,Taro.getSystemInfoSync().windowWidth-64)),columns=4,cell=width/columns,height=result?.strokes?Math.ceil(result.strokes.length/columns)*(cell+22):0;
 useEffect(()=>{let alive=true;setResult(null);setFailed(false);void api<Result>(`/children/${child}/hanzi/${id}/strokes`).then(r=>{if(alive)setResult(r);}).catch(()=>{if(alive)setFailed(true);});return()=>{alive=false;};},[child,id,character,strokes]);
 useEffect(()=>{if(result?.status!=='available'||!result.strokes)return;const timer=setTimeout(()=>{try{const ctx=Taro.createCanvasContext('hanzi-stroke-grid');for(let i=0;i<result.strokes!.length;i++){const x=i%columns*cell,y=Math.floor(i/columns)*(cell+22),pad=3,s=cell-6;ctx.setStrokeStyle('#b8c9c8');ctx.setLineWidth(1);ctx.strokeRect(x+pad,y+pad,s,s);ctx.setLineDash([3,3],0);ctx.beginPath();ctx.moveTo(x+pad+s/2,y+pad);ctx.lineTo(x+pad+s/2,y+pad+s);ctx.moveTo(x+pad,y+pad+s/2);ctx.lineTo(x+pad+s,y+pad+s/2);ctx.stroke();ctx.setLineDash([],0);for(let j=0;j<=i;j++){ctx.setFillStyle(j===i?'#2e79a6':'#52666a');drawStroke(ctx,result.strokes![j],x+pad,y+pad,s);}ctx.setFillStyle('#75868b');ctx.setFontSize(11);ctx.fillText(String(i+1),x+cell/2-3,y+cell+14);}ctx.draw();}catch{setFailed(true);}},100);return()=>clearTimeout(timer);},[result,cell]);
 if(failed)return <Text className='muted'>笔顺暂时无法显示，请稍后重试。</Text>;
 if(!result)return <Text className='muted'>正在加载笔顺…</Text>;
 if(result.status==='too_many')return <Text className='muted'>该字超过 30 笔，暂不展示笔顺。</Text>;
 if(result.status==='mismatch')return <Text className='muted'>笔顺数据与填写的笔画数不一致，请核对后再查看。</Text>;
 if(result.status!=='available')return <Text className='muted'>暂无笔顺数据。</Text>;
 return <View><Canvas canvasId='hanzi-stroke-grid' style={{width:`${width}px`,height:`${height}px`}}/><Text className='muted small'>蓝色为当前笔画；笔顺仅供参考，请以教材为准。</Text></View>;
}
