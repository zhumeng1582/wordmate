import {View,Button,Text} from '@tarojs/components';
import './ListLoadState.css';
export function ListLoadState({loading,failed,hasMore,ready,count,onRetry}:{loading:boolean;failed:boolean;hasMore:boolean;ready:boolean;count:number;onRetry:()=>void}){
 if(!ready||!count)return null;
 return <View className='list-load-state' role='status'>{loading?<><View className='list-load-spinner'/><Text>正在加载…</Text></>:failed?<Button className='list-load-retry' onClick={onRetry}>加载失败，点击重试</Button>:<Text>{hasMore?'上拉加载更多':'已全部加载'}</Text>}</View>;
}
