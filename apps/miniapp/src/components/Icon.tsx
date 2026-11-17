import {View} from '@tarojs/components';
import './Icon.css';

export type IconName='search'|'settings'|'filter'|'more'|'volume'|'star'|'star-filled'|'chevron'|'plus'|'close'|'copy'|'edit'|'calendar'|'history'|'home'|'book'|'family'|'sparkles'|'shield'|'help'|'chat';
export function Icon({name,tone='normal',size='md',className=''}:{name:IconName;tone?:'normal'|'primary'|'inverse';size?:'sm'|'md'|'lg';className?:string}){
 return <View className={`app-icon app-icon-${name} app-icon-${tone} app-icon-${size} ${className}`} aria-hidden/>;
}
