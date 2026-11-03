import {useRef,useState} from 'react';
import {Button,View} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {constrainTutorFloat,snapTutorFloat,type FloatBounds,type FloatPoint} from './tutor-float-geometry';
import './TutorFloat.css';

function dimensions():FloatBounds{
 const info=Taro.getWindowInfo();
 return {width:info.windowWidth,height:info.windowHeight,size:info.windowWidth*88/750,bottomInset:Math.max(0,info.screenHeight-(info.safeArea?.bottom??info.screenHeight))};
}

export function TutorFloat({wordId,onOpen}:{wordId:string;onOpen?:()=>void}){
 const [bounds]=useState(dimensions),[position,setPosition]=useState<FloatPoint>(()=>snapTutorFloat({x:bounds.width,y:bounds.height*.55},bounds)),[dragging,setDragging]=useState(false);
 const start=useRef<{touch:FloatPoint;position:FloatPoint;moved:boolean}|null>(null),positionRef=useRef(position),suppressClick=useRef(false);positionRef.current=position;
 const startTouch=(event:any)=>{event.stopPropagation();const p=event.touches?.[0];if(!p)return;suppressClick.current=false;start.current={touch:{x:p.clientX,y:p.clientY},position:positionRef.current,moved:false};};
 const moveTouch=(event:any)=>{event.stopPropagation();const s=start.current,p=event.touches?.[0];if(!s||!p)return;const dx=p.clientX-s.touch.x,dy=p.clientY-s.touch.y;if(!s.moved&&Math.hypot(dx,dy)<6)return;s.moved=true;setDragging(true);const next=constrainTutorFloat({x:s.position.x+dx,y:s.position.y+dy},bounds);positionRef.current=next;setPosition(next);};
 const endTouch=(event:any)=>{event.stopPropagation();const s=start.current;start.current=null;if(!s)return;if(s.moved){suppressClick.current=true;const next=snapTutorFloat(positionRef.current,bounds);positionRef.current=next;setPosition(next);}setDragging(false);};
 if(!wordId)return null;
 return <View className={`tutor-float-wrap ${dragging?'is-dragging':''}`} style={{left:`${position.x}px`,top:`${position.y}px`}} catchMove onTouchStart={startTouch} onTouchMove={moveTouch} onTouchEnd={endTouch} onTouchCancel={endTouch}><Button className='tutor-float' aria-label='问问 AI 小老师' onClick={event=>{event.stopPropagation();if(suppressClick.current){suppressClick.current=false;return;}onOpen?.();void Taro.navigateTo({url:`/pages/word-tutor/index?word=${encodeURIComponent(wordId)}`});}}><View className='tutor-bot'><View className='tutor-bot-antenna'/><View className='tutor-bot-face'><View className='tutor-bot-eye left'/><View className='tutor-bot-eye right'/><View className='tutor-bot-smile'/></View><View className='tutor-bot-sparkle'/></View></Button></View>;
}
