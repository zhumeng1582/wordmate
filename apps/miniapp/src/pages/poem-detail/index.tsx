import {useRouter} from '@tarojs/taro';
import Poems from '../poems/index';
export default function PoemDetail(){const router=useRouter();return <Poems detailId={String(router.params.id||'')} editOnOpen={router.params.edit==='1'}/>;}
