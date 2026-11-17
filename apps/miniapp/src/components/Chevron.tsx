import {Icon} from './Icon';

export function Chevron({direction='right',className=''}:{direction?:'right'|'left'|'up'|'down';className?:string}){
 return <Icon name='chevron' className={`ui-chevron ui-chevron-${direction} ${className}`}/>;
}
