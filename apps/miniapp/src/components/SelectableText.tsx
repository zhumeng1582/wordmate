import {useRef,type ComponentProps} from 'react';
import {Text} from '@tarojs/components';
import './SelectableText.css';

type Props=Omit<ComponentProps<typeof Text>,'selectable'|'userSelect'>&{block?:boolean};
/** Keep native selection gestures from becoming a parent tap or card swipe. */
export function SelectableText({block=false,className='',onClick,onLongPress,onTouchStart,onTouchMove,onTouchEnd,onTouchCancel,...props}:Props){
 const selecting=useRef(false);
 return <Text {...props} className={`${className}${block?' selectable-text-block':''}`.trim()} selectable userSelect
  onTouchStart={event=>{selecting.current=false;onTouchStart?.(event);}}
  onLongPress={event=>{selecting.current=true;event.stopPropagation();onLongPress?.(event);}}
  onTouchMove={event=>{if(selecting.current)event.stopPropagation();onTouchMove?.(event);}}
  onTouchEnd={event=>{if(selecting.current)event.stopPropagation();onTouchEnd?.(event);}}
  onTouchCancel={event=>{if(selecting.current)event.stopPropagation();onTouchCancel?.(event);}}
  onClick={event=>{if(selecting.current){event.stopPropagation();return;}onClick?.(event);}}/>;
}
