import {useEffect,useRef,useState} from 'react';
import {View,Text,Button} from '@tarojs/components';
import {Icon} from './Icon';
import {libraryFilterOptions,libraryStatusLabels,librarySelectedStatuses,libraryFilterValue,type LibraryFilter as Filter,type LibraryStatus} from '../services/library-status';
import './LibraryFilter.css';

export function LibraryFilter({value,onChange,onClose}:{value:Filter;onChange:(value:Filter)=>void;onClose:()=>void}){
 const [selected,setSelected]=useState<LibraryStatus[]>(()=>librarySelectedStatuses(value)),current=useRef(selected);
 useEffect(()=>{const next=librarySelectedStatuses(value);current.current=next;setSelected(next);},[value]);
 const change=(next:LibraryStatus[])=>{current.current=next;setSelected(next);onChange(libraryFilterValue(next));};
 const toggle=(status:LibraryStatus)=>{const old=current.current,next=old.includes(status)?old.filter(s=>s!==status):[...old,status];if(next.length)change(next);};
 return <View className='library-filter-mask' catchMove onClick={onClose}>
  <View className='library-filter-panel' role='dialog' aria-label='学习状态筛选' onClick={event=>event.stopPropagation()}>
   <View className='library-filter-heading'><View className='library-filter-title'>学习状态<Text className='library-filter-hint'>可多选</Text></View><Button className='library-filter-reset' onClick={()=>{if(libraryFilterValue(current.current)!=='all')change(['unlearned','learned']);}}>恢复默认</Button><Button className='library-filter-close' aria-label='关闭筛选' onClick={onClose}><Icon name='close' size='sm'/></Button></View>
   <View className='library-filter-options'>{libraryFilterOptions.map(status=><Button key={status} className={`library-filter-option ${selected.includes(status)?'is-selected':''}`} aria-label={libraryStatusLabels[status]} aria-pressed={selected.includes(status)} onClick={()=>toggle(status)}><Text>{libraryStatusLabels[status]}</Text><Text className='library-filter-check'>{selected.includes(status)?'✓':''}</Text></Button>)}</View>
   <View className='library-filter-note'>至少选择一种状态，点选后立即生效</View>
  </View>
 </View>;
}
