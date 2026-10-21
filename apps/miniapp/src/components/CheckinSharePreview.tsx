import {View,Button,Image} from '@tarojs/components';
import type {ShareRecord} from '../services/share-poster';
import './CheckinSharePreview.css';
export function CheckinSharePreview({data,image,busy,error,albumDenied,onClose,onNext,onRetry,onSave,onSettings}:{data:ShareRecord|null;image:string;busy:boolean;error:string;albumDenied:boolean;onClose:()=>void;onNext:()=>void;onRetry:()=>void;onSave:()=>void;onSettings:()=>void}){
 return <View className='share-backdrop' catchMove onClick={onClose}><View className='share-sheet' onClick={e=>e.stopPropagation()}>
 <View className='share-heading'><View>分享学习成果</View><Button className='text-action' onClick={onClose}>关闭</Button></View>
 <View className='share-preview'>{image?<Image className='share-poster' src={image} mode='aspectFit'/>:<View className='muted'>{error?'暂时无法生成预览':'正在准备成果卡…'}</View>}</View>
 <View className='share-hint muted small'>{busy?'正在准备…':'只分享学习成果，不包含孩子姓名或家庭信息。'}</View>
 {error&&<View className='error'>{error}{!albumDenied&&<Button className='text-action' disabled={busy} onClick={onRetry}>重试</Button>}{albumDenied&&<Button className='text-action' onClick={onSettings}>打开相册权限设置</Button>}</View>}
 <Button className='text-action' disabled={busy||!data} onClick={onNext}>换一句</Button>
 <View className='row'><Button className='btn primary' openType='share' disabled={busy||!image}>分享给朋友</Button><Button className='btn' disabled={busy||!image} onClick={onSave}>保存图片</Button></View>
 </View></View>;
}
