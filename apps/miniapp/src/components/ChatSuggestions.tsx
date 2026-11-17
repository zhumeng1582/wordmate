import {View,Button} from '@tarojs/components';
import './ChatSuggestions.css';
type Message={id?:string;role:string;suggestions?:string[];payload?:{suggestions?:string[]}};
export function ChatSuggestions({messages=[],busy=false,disabled=false,onSend}:{messages?:Message[];busy?:boolean;disabled?:boolean;onSend:(text:string)=>void}){
 const latest=messages[messages.length-1];if(busy||latest?.role!=='assistant')return null;
 const values=latest.suggestions??latest.payload?.suggestions??[];
 const suggestions=[...new Set(values.filter(x=>typeof x==='string'&&x.trim()&&x.length<=40).map(x=>x.trim()))].slice(0,3);
 if(!suggestions.length)return null;
 return <View className='chat-replies' aria-label='推荐回复'>{suggestions.map(text=><Button key={text} className='chat-reply' disabled={disabled} onClick={()=>onSend(text)}>{text}</Button>)}</View>;
}
