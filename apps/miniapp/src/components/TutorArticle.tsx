import {SelectableText} from './SelectableText';
import {useState} from 'react';
import {View,Text,Button} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {useAudio} from '../services/audio';
import './TutorArticle.css';
function marked(text:string,words:any[]){
 const tokens=words.map(w=>w.lemma).sort((a,b)=>b.length-a.length).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 if(!tokens.length)return <Text>{text}</Text>;
 const matcher=new RegExp(`(^|[^a-z])(${tokens.join('|')})(?=$|[^a-z])`,'gi'),parts:any[]=[];let end=0;
 for(const match of text.matchAll(matcher)){
  const offset=match.index!+match[1].length,surface=match[2],word=words.find(w=>w.lemma.toLowerCase()===surface.toLowerCase());
  parts.push(<Text key={`${offset}-plain`}>{text.slice(end,offset)}</Text>);
  parts.push(<SelectableText key={offset} className='tutor-article-highlight' onClick={()=>void Taro.showModal({title:word.lemma,content:`${word.part_of_speech} · ${word.meaning_zh}`,showCancel:false})}>{surface}</SelectableText>);
  end=offset+surface.length;
 }
 parts.push(<Text key='end'>{text.slice(end)}</Text>);return parts;
}
export function TutorArticle({m,audio}:{m:any;audio:ReturnType<typeof useAudio>}){
 const [translated,setTranslated]=useState(false);const a=m.payload;
 return <View className='tutor-article'><View className='subtitle'>{a.title}</View><View className='muted small'>{a.range.date_from} — {a.range.date_to}</View>{a.paragraphs.map((p:any,i:number)=><View key={i} className='tutor-article-paragraph'><SelectableText block>{marked(p.en,a.used_words)}</SelectableText>{translated&&<SelectableText block className='muted tutor-article-translation'>{p.zh}</SelectableText>}</View>)}<View className='tutor-message-actions'><Button className='text-action' onClick={()=>setTranslated(v=>!v)}>{translated?'收起译文':'展开译文'}</Button><Button className='text-action' onClick={()=>void audio.play({assistant_message_id:m.id})}>听文章</Button></View><View className='muted small'>本篇使用：{a.used_words.map((w:any)=>w.lemma).join('、')}</View></View>;
}
