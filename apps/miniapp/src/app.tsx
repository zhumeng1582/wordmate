import {installPrivacyAuthorization} from './services/privacy-authorization';
import type {PropsWithChildren} from 'react';
import {useLaunch,useDidShow} from '@tarojs/taro';
import {storage} from './services/api';
import './app.css';
export default function App({children}:PropsWithChildren){const capture=(options:any)=>{const code=options?.query?.ref;if(typeof code==='string'&&/^[a-zA-Z0-9_-]{6,32}$/.test(code)&&!storage.get('access_token'))storage.set('pending_referral_code',code.toLowerCase());};useLaunch(options=>{capture(options);installPrivacyAuthorization();});useDidShow(capture);return children;}
