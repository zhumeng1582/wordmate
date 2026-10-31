import {yuanMicros} from './ai-wallet.ts';
import {ensure} from './errors.ts';
export type AudioTariff={model:string;yuan_per_10000_characters:string;character_rule:'han2-other1-v1'};
export function configuredAudioPrice(env:Record<string,string|undefined>){
 // Beijing CosyVoice-v3-flash published tariff, verified 2026-10-31.
 return env.AUDIO_YUAN_PER_10000_CHARACTERS||((env.COSYVOICE_MODEL||'cosyvoice-v3-flash')==='cosyvoice-v3-flash'?'1':undefined);
}
export function audioTariff(model:string,price:unknown):AudioTariff{
 ensure(typeof price==='string'&&yuanMicros(price)>0,503,'AUDIO_PRICE_NOT_CONFIGURED');
 return {model,yuan_per_10000_characters:price as string,character_rule:'han2-other1-v1'};
}
export function audioCharacters(text:string){return Array.from(text).reduce((n,char)=>n+(/\p{Script=Han}/u.test(char)?2:1),0);}
export function audioCost(characters:number,tariff:AudioTariff){
 ensure(Number.isSafeInteger(characters)&&characters>0&&characters<=2000&&tariff.character_rule==='han2-other1-v1',422,'INVALID_SPEECH_REQUEST');
 return Number((BigInt(characters)*BigInt(yuanMicros(tariff.yuan_per_10000_characters))+9999n)/10000n);
}
