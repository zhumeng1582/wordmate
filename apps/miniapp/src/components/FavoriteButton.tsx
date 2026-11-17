import {useEffect,useRef,useState} from 'react';
import {Button,Text} from '@tarojs/components';
import Taro,{useDidHide} from '@tarojs/taro';
import {api,eventId,message,storage} from '../services/api';
import type {WordAnnotationsRequest} from '../generated/word-annotations';
import './FavoriteButton.css';
import {Icon} from './Icon';
type Favorite={favorite:boolean;version:number};
export function FavoriteButton({wordId,initial,onChange,onInteract,compact=true,disabled=false}:{wordId:string;compact?:boolean;disabled?:boolean;initial?:Favorite;onChange?:(value:Favorite)=>void;onInteract?:()=>void}){
 const [value,setValue]=useState<Favorite|null>(initial??null),[busy,setBusy]=useState(false);const serial=useRef(0),lock=useRef(false),owner=useRef(`${storage.get('access_token')}:${storage.get('child_id')}`);
 useDidHide(()=>{serial.current++;lock.current=false;setBusy(false);});
 useEffect(()=>{const ticket=++serial.current,scope=`${storage.get('access_token')}:${storage.get('child_id')}`;owner.current=scope;setValue(initial??null);if(!initial)void api<Favorite>(`/words/${wordId}/annotations`).then(data=>{if(ticket===serial.current&&scope===`${storage.get('access_token')}:${storage.get('child_id')}`)setValue(data);}).catch(()=>{});return()=>{serial.current++;};},[wordId,initial?.version]);
 const toggle=async(e:any)=>{e?.stopPropagation?.();onInteract?.();if(lock.current||disabled||owner.current!==`${storage.get('access_token')}:${storage.get('child_id')}`)return;lock.current=true;setBusy(true);const ticket=++serial.current,scope=`${storage.get('access_token')}:${storage.get('child_id')}`;try{const current=await api<Favorite>(`/words/${wordId}/annotations`);if(ticket!==serial.current||scope!==`${storage.get('access_token')}:${storage.get('child_id')}`)return;const patch:WordAnnotationsRequest={expected_version:current.version,favorite:!current.favorite},updated=await api<Favorite>(`/words/${wordId}/annotations`,'PATCH',patch,eventId());if(ticket===serial.current&&scope===`${storage.get('access_token')}:${storage.get('child_id')}`){setValue(updated);onChange?.(updated);void Taro.showToast({title:updated.favorite?'已收藏':'已取消收藏',icon:'success'});}}catch(error){if(ticket===serial.current&&scope===`${storage.get('access_token')}:${storage.get('child_id')}`)Taro.showToast({title:message(error),icon:'none'});}finally{lock.current=false;if(ticket===serial.current)setBusy(false);}};
 return <Button className={`${compact?'favorite-button':'content-action'} ${value?.favorite?'is-favorite':''}`} aria-label={value?.favorite?'取消收藏单词':'收藏单词'} disabled={busy||disabled} onClick={toggle}><Icon name={value?.favorite?'star-filled':'star'} size={compact?undefined:'sm'} tone={value?.favorite?'primary':'normal'}/>{!compact&&<Text>{value?.favorite?'已收藏':'收藏'}</Text>}</Button>;
}
