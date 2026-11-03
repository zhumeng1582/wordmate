import {Text} from '@tarojs/components';

export function Chevron({direction='right',className=''}:{direction?:'right'|'left'|'up'|'down';className?:string}){
 return <Text className={`ui-chevron ui-chevron-${direction} ${className}`} aria-hidden/>;
}
