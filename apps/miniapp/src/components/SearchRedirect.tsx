import {useEffect} from 'react';
import Taro,{useRouter} from '@tarojs/taro';
import {View} from '@tarojs/components';
export function SearchRedirect(){const params=useRouter().params;useEffect(()=>{void Taro.redirectTo({url:`/pages/search/index${params.q?`?q=${encodeURIComponent(params.q)}`:''}`});},[]);return <View className='page muted'>正在打开统一搜索…</View>;}
