import {useEffect,useRef,useState} from 'react';
import {Button} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {api,eventId,message,storage} from '../services/api';
import type {WordAnnotationsRequest} from '../generated/word-annotations';
import './FavoriteButton.css';
type Favorite={favorite:boolean;version:number};
export function FavoriteButton({wordId,initial,onChange,onInteract}:{wordId:string;initial?:Favorite;onChange?:(value:Favorite)=>void;onInteract?:()=>void}){
 const [value,setValue]=useState<Favorite|null>(initial??null),[busy,setBusy]=useState(false);const serial=useRef(0),lock=useRef(false);
 useEffect(()=>{const ticket=++serial.current,scope=`${storage.get('access_token')}:${storage.get('child_id')}`;setValue(initial??null);if(!initial)void api<Favorite>(`/words/${wordId}/annotations`).then(data=>{if(ticket===serial.current&&scope===`${storage.get('access_token')}:${storage.get('child_id')}`)setValue(data);}).catch(()=>{});return()=>{serial.current++;};},[wordId]);
 const toggle=async(e:any)=>{e?.stopPropagation?.();onInteract?.();if(lock.current)return;lock.current=true;setBusy(true);const ticket=++serial.current,scope=`${storage.get('access_token')}:${storage.get('child_id')}`;try{const current=await api<Favorite>(`/words/${wordId}/annotations`),patch:WordAnnotationsRequest={expected_version:current.version,favorite:!current.favorite},updated=await api<Favorite>(`/words/${wordId}/annotations`,'PATCH',patch,eventId());if(ticket===serial.current&&scope===`${storage.get('access_token')}:${storage.get('child_id')}`){setValue(updated);onChange?.(updated);}}catch(error){if(ticket===serial.current)Taro.showToast({title:message(error),icon:'none'});}finally{lock.current=false;if(ticket===serial.current)setBusy(false);}};
 return <Button className={`favorite-button ${value?.favorite?'is-favorite':''}`} aria-label={value?.favorite?'取消收藏':'收藏单词'} disabled={busy} onClick={toggle}>{value?.favorite?'★':'☆'}</Button>;
}
