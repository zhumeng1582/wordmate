import Taro from '@tarojs/taro';
type Stop=Taro.RecorderManager.OnStopCallbackResult;
let manager:Taro.RecorderManager|null=null;
const listeners=new Set<{stop:(value:Stop)=>void;fail:()=>void}>();
export function tutorRecorder(){
 if(!manager){manager=Taro.getRecorderManager();manager.onStop(value=>{if(!listeners.size&&value.tempFilePath)Taro.getFileSystemManager().unlink({filePath:value.tempFilePath,fail:()=>{}});const listener=Array.from(listeners).slice(-1)[0];listener?.stop(value);});manager.onError(()=>{const listener=Array.from(listeners).slice(-1)[0];listener?.fail();});}
 return manager;
}
export function subscribeTutorRecorder(stop:(value:Stop)=>void,fail:()=>void){const listener={stop,fail};listeners.add(listener);return()=>{listeners.delete(listener);};}
