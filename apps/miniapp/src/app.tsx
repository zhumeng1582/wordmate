import {installPrivacyAuthorization} from './services/privacy-authorization';
import type {PropsWithChildren} from 'react';
import {useLaunch,useDidShow} from '@tarojs/taro';
import {storage} from './services/api';
import {pendingReferral,referralFromLaunch} from './services/referral';
import './app.css';
export default function App({children}:PropsWithChildren){const capture=(options:any)=>{const code=referralFromLaunch(options?.query);if(code&&!storage.get('access_token'))storage.set('pending_referral_code',pendingReferral(code,storage.get('pending_referral_code')));};useLaunch(options=>{capture(options);installPrivacyAuthorization();});useDidShow(capture);return children;}
