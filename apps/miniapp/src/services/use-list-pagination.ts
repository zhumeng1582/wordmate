import {useEffect,useRef,useState} from 'react';
import Taro,{useReachBottom,usePullDownRefresh,useDidHide,useDidShow} from '@tarojs/taro';
type Options={key:string;hasMore:boolean;count:number;ready:boolean;blocked?:boolean;refreshBlocked?:boolean;canLoad?:()=>boolean;more:()=>Promise<unknown>;refresh:()=>Promise<unknown>};
export function useListPagination(options:Options){
 const latest=useRef(options);latest.current=options;const generation=useRef(0),context=useRef(options.key),lock=useRef(false),visible=useRef(true);
 const [state,setState]=useState({key:options.key,loading:false,error:false});
 if(context.current!==options.key){context.current=options.key;generation.current++;lock.current=false;}
 const active=(n:number,key:string)=>visible.current&&n===generation.current&&key===latest.current.key;
 const run=async(retry=false)=>{const o=latest.current,failed=state.key===o.key&&state.error;if(!visible.current||lock.current||o.blocked||!o.ready||!o.hasMore||!retry&&failed||o.canLoad&&!o.canLoad())return;lock.current=true;const n=++generation.current,key=o.key;setState({key,loading:true,error:false});try{const result=await o.more();if(active(n,key))setState({key,loading:false,error:result===false});}catch{if(active(n,key))setState({key,loading:false,error:true});}finally{if(active(n,key))lock.current=false;}};
 const refresh=async()=>{const o=latest.current;if(!visible.current||o.blocked||o.refreshBlocked||lock.current||o.canLoad&&!o.canLoad()){void Taro.stopPullDownRefresh();return;}lock.current=true;const n=++generation.current,key=o.key;setState({key,loading:false,error:false});try{await o.refresh();}catch{}finally{if(active(n,key))lock.current=false;void Taro.stopPullDownRefresh();}};
 useReachBottom(()=>{void run();});usePullDownRefresh(()=>{void refresh();});
 useDidHide(()=>{visible.current=false;generation.current++;lock.current=false;setState(old=>({...old,loading:false}));});useDidShow(()=>{visible.current=true;});
 useEffect(()=>()=>{visible.current=false;generation.current++;lock.current=false;},[]);
 const current=state.key===options.key?state:{loading:false,error:false};
 return {loading:current.loading,failed:current.error,hasMore:options.hasMore,ready:options.ready,count:options.count,onRetry:()=>{void run(true);}};
}
