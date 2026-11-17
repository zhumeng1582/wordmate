import type {ReactNode} from 'react';
import {useRef,useState} from 'react';
import {useDidHide} from '@tarojs/taro';
import {View,Button,Text} from '@tarojs/components';
import {Icon} from './Icon';
import './ContentActions.css';
type Props={name:string;favorite:boolean;disabled?:boolean;status:string;badges?:string[];favoriteControl?:ReactNode;onFavorite?:()=>void;markItems:string[];contentItems?:string[];onMark:(index:number)=>void;onContent?:(index:number)=>void;contextKey:string};
export function ContentActions({name,favorite,disabled,status,badges=[],favoriteControl,onFavorite,markItems,contentItems=[],onMark,onContent,contextKey}:Props){
 const [expanded,setExpanded]=useState<string|null>(null);
 const generation=useRef(0),renderedGeneration=generation.current;
 useDidHide(()=>{generation.current++;setExpanded(null);});
 const markExpanded=expanded===contextKey;
 const toggle=()=>setExpanded(old=>old===contextKey?null:contextKey);
 const run=(action:(index:number)=>void,index:number)=>{if(disabled||generation.current!==renderedGeneration)return;setExpanded(null);action(index);};
 return <View className='content-actions'><View className='content-actions-bar'><View className='content-actions-status' role='status' aria-label={`学习状态：${status}`}><Text>{status}</Text>{badges.map(label=><Text key={label} className='content-actions-badge'>{label}</Text>)}</View><View className='content-actions-tools'>{favoriteControl??<Button className={`content-action ${favorite?'is-favorite':''}`} aria-label={`${favorite?'取消收藏':'收藏'}${name}`} disabled={disabled} onClick={onFavorite}><Icon name={favorite?'star-filled':'star'} size='sm' tone={favorite?'primary':'normal'}/><Text>{favorite?'已收藏':'收藏'}</Text></Button>}<Button className='content-action' aria-label={`标记${name}`} aria-expanded={markExpanded} disabled={disabled} onClick={toggle}><Icon name='edit' size='sm' tone='normal'/><Text>标记</Text></Button>{onContent&&contentItems.map((title,index)=><Button key={title} className={`content-action${title.startsWith('删除')?' is-danger':''}`} aria-label={title} disabled={disabled} onClick={()=>run(onContent,index)}><Icon name={title.startsWith('删除')?'close':'edit'} size='sm' tone='normal'/><Text>{title==='编辑内容'?'编辑':title.startsWith('删除')?'删除':title==='标记待纠错'?'纠错':title==='取消纠错标记'?'取消纠错':title}</Text></Button>)}</View></View>{markExpanded&&<View className='content-actions-panel'>{markItems.map((title,index)=><Button key={title} className={`content-action-option${title.startsWith('删除')?' is-danger':''}`} disabled={disabled} onClick={()=>run(onMark,index)}>{title}</Button>)}</View>}</View>;
}
