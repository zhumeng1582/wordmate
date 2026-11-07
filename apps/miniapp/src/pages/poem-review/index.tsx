import {useRouter} from '@tarojs/taro';
import Poems from '../poems/index';
export default function PoemReview(){const router=useRouter();return <Poems reviewId={String(router.params.id||'')}/>;}
