import { Platform } from 'react-native';

const configuredUrl=process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/,'');
export const baseUrl=configuredUrl ?? (__DEV__
  ? Platform.OS==='android'?'http://10.0.2.2:4000':'http://127.0.0.1:4000'
  : '');
let token:string|null=null;
export function getToken():string|null{return token;}
export function setToken(value:string|null):void{token=value;}
export function authHeaders():Record<string,string>{return token?{authorization:`Bearer ${token}`}:{}}
