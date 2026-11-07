import {useRouter} from '@tarojs/taro';
import Poems from '../poems/index';
export default function PoemEntry(){const router=useRouter();return <Poems entryMode={router.params.mode==='edit'?'edit':'import'}/>;}
