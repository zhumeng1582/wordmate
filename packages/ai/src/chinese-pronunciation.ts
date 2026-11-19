import {pinyin} from 'pinyin-pro';
import type {RepairResult} from './content-repair.ts';
// Corrections to generic dictionary defaults, scoped to lexical phrases rather
// than to a particular poem or user. Keep the source beside each exception.
const phrases=[
 {text:'杂兴',ph:['za2','xing4'],source:'https://dict.revised.moe.edu.tw/dictView.jsp?ID=138150'},
 {text:'雜興',ph:['za2','xing4'],source:'https://dict.revised.moe.edu.tw/dictView.jsp?ID=138150'},
];
export function chinesePronunciationPlan(text:string):{candidate:RepairResult;reference:{provider:string;phrases:typeof phrases}}|null{
 if(!text||text.length>1000||/[A-Za-z]/.test(text))return null;
 const spans:RepairResult['pronunciations']=[],used:typeof phrases=[];
 for(const match of text.matchAll(/\p{Script=Han}+/gu)){
  const characters=Array.from(match[0]),phones=pinyin(match[0],{toneType:'num',type:'array',toneSandhi:false}).map(v=>v.toLowerCase().replace(/ü/g,'v').replace(/0$/,'5'));
  if(phones.length!==characters.length||phones.some(ph=>!/^[a-zv]+[1-5]$/.test(ph)))return null;
  for(const phrase of phrases){let start=0,index:number;while((index=match[0].indexOf(phrase.text,start))>=0){const at=Array.from(match[0].slice(0,index)).length;phones.splice(at,phrase.ph.length,...phrase.ph);if(!used.includes(phrase))used.push(phrase);start=index+phrase.text.length;}}
  for(let start=0;start<characters.length;start+=200)spans.push({text:characters.slice(start,start+200).join(''),alphabet:'py',ph:phones.slice(start,start+200).join(' ')});
 }
 if(!spans.length||spans.length>40)return null;
 return {candidate:{values:{},pronunciations:spans,note:'已按普通话词典核对读音，重新生成本首诗的朗读。',verified:true},reference:{provider:'pinyin-pro',phrases:used}};
}

export function validChinesePhonemes(text:string,ph:string):boolean{
 const chars=Array.from(text),phones=ph.toLowerCase().replace(/ü/g,'v').split(' ');if(chars.length!==phones.length)return false;
 for(let i=0;i<chars.length;i++){
  const allowed=pinyin(chars[i],{toneType:'num',type:'array',multiple:true,toneSandhi:false}).map(v=>v.toLowerCase().replace(/ü/g,'v').replace(/0$/,'5'));
  if(chars[i]==='一')allowed.push('yi2','yi4');if(chars[i]==='不')allowed.push('bu2');
  if(allowed.some(v=>/^[a-zv]+[1-5]$/.test(v))&&!allowed.includes(phones[i]))return false;
 }
 for(const phrase of phrases){let start=0,index:number;while((index=text.indexOf(phrase.text,start))>=0){const at=Array.from(text.slice(0,index)).length;if(phones.slice(at,at+phrase.ph.length).join(' ')!==phrase.ph.join(' '))return false;start=index+phrase.text.length;}}
 return true;
}
