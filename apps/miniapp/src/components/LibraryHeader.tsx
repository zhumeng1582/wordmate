import {View,Text,Button,Picker} from '@tarojs/components';
import {Icon} from './Icon';
import {Chevron} from './Chevron';
import './LibraryHeader.css';
type Book={id:string;name:string;read_only?:boolean};
type Props={name:string;title:string;books?:Book[];bookId?:string;onBookChange?:(id:string)=>void;onOpenBooks?:()=>void;disabled?:boolean;selecting?:boolean;onSearch:()=>void;onMore:()=>void};
export function LibraryHeader({name,title,books=[],bookId,onBookChange,onOpenBooks,disabled=false,selecting=false,onSearch,onMore}:Props){
 const book=books.find(item=>item.id===bookId);
 const choice=<View className='library-header-choice'><Text className='library-header-title'>{book?.name||title}</Text>{book?.read_only&&<Text className='library-header-shared'>共享</Text>}{books.length>0&&onBookChange&&<Chevron direction='down'/>}</View>;
 return <View className='library-header'>
  {onOpenBooks?<Button className='library-header-picker library-header-switch' aria-label={name==='句子'?'切换句子本':name==='古诗'?'切换诗本':name==='汉字'?'切换字本':'切换词本'} disabled={disabled||selecting} onClick={onOpenBooks}>{choice}</Button>:books.length>0&&onBookChange?<Picker className='library-header-picker' mode='selector' disabled={disabled||selecting} range={books.map(item=>`${item.name}${item.read_only?' · 共享':''}`)} value={Math.max(0,books.findIndex(item=>item.id===bookId))} onChange={event=>{const id=books[Number(event.detail.value)]?.id;if(id)onBookChange(id);}}>{choice}</Picker>:<View className='library-header-static'>{choice}</View>}
  {!selecting&&<View className='library-header-actions'>
   <Button className='library-header-button' aria-label={`搜索${name}`} disabled={disabled} onClick={onSearch}><Icon name='search' size='lg'/></Button>
   <Button className='library-header-button' aria-label={`更多${name}操作`} disabled={disabled} onClick={onMore}><Icon name='more' size='lg'/></Button>
  </View>}
 </View>;
}
export function LibraryOverview({name,count,scope,disabled=false,onFilter}:{name:string;count:string;scope:string;disabled?:boolean;onFilter:()=>void}){
 return <View className='library-overview'><View className='library-overview-heading'><Text>{name}列表</Text><Text className='library-overview-count'>{count}</Text></View><Button className='library-overview-scope' aria-label={`筛选${name}`} disabled={disabled} onClick={onFilter}><Text>{scope}</Text><Chevron direction='down'/></Button></View>;
}
