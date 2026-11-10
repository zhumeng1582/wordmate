import type {Core} from './core';
import type {AiAccounts} from './ai-accounts';
import type {AiPayments} from './ai-payments';
import type {Lifecycle} from './lifecycle';
import {StoredMeaningQuizBuilder} from './quiz';

/** The API owns these workers for now; their lifecycle is kept separate from routing. */
export function startWorkers(core:Core,accounts:AiAccounts,payments:AiPayments,lifecycle:Lifecycle){
 let cleanup:Promise<void>|undefined;
 const purgeImports=()=>{if(!cleanup)cleanup=core.imports.purge().then(()=>core.hanziImports.purge()).then(()=>lifecycle.purgeEphemeral()).catch(()=>console.error('Import cache cleanup failed')).finally(()=>{cleanup=undefined;});};
 purgeImports();const cleanupTimer=setInterval(purgeImports,3600000);cleanupTimer.unref();
 let preparation:Promise<void>|undefined;
 const quizTimer=setInterval(()=>{if(preparation)return;preparation=core.quizzes.prepare(new StoredMeaningQuizBuilder()).then(()=>{}).catch(()=>console.error('Quiz preparation cycle failed')).finally(()=>{preparation=undefined;});},2000);quizTimer.unref();
 let generation:Promise<void>|undefined;
 const aiTimer=setInterval(()=>{if(generation)return;generation=core.vocabulary.processOne().catch(()=>{console.error('Vocabulary generation cycle failed');}).finally(()=>{generation=undefined;});},1000);aiTimer.unref();
 let poemWork:Promise<void>|undefined;
 const poemTimer=setInterval(()=>{if(poemWork)return;poemWork=core.poemImports.processOne().catch(()=>console.error('Poem import cycle failed')).finally(()=>{poemWork=undefined;});},1000);poemTimer.unref();
 let hanziWork:Promise<void>|undefined;
 const hanziTimer=setInterval(()=>{if(hanziWork)return;hanziWork=core.hanziImports.processOne().catch(()=>console.error('Hanzi import cycle failed')).finally(()=>{hanziWork=undefined;});},1000);hanziTimer.unref();
 let audioWork:Promise<void>|undefined;
 const audioTimer=setInterval(()=>{if(audioWork)return;audioWork=core.audio.previews.processOne().then(()=>core.audio.processOne()).catch(()=>console.error('Audio generation cycle failed')).finally(()=>{audioWork=undefined;});},1000);audioTimer.unref();
 const shareImageWorkers=new Set<Promise<void>>();
 const shareImageTimer=setInterval(()=>{if(shareImageWorkers.size>=3)return;let work:Promise<void>;work=core.checkinShare.processImageOne().then(()=>{}).catch(()=>console.error('Share poster generation cycle failed')).finally(()=>{shareImageWorkers.delete(work);});shareImageWorkers.add(work);},1000);shareImageTimer.unref();
 let deletionWork:Promise<void>|undefined;
 const deletionTimer=setInterval(()=>{if(!deletionWork)deletionWork=lifecycle.processOne().catch(()=>console.error('Deletion cycle failed')).finally(()=>{deletionWork=undefined;});},1000);deletionTimer.unref();
 let billingWork:Promise<void>|undefined;const billingTimer=setInterval(()=>{if(!billingWork)billingWork=accounts.sweep().then(()=>payments.reconcile()).catch(()=>console.error('AI account maintenance failed')).finally(()=>{billingWork=undefined;});},30000);billingTimer.unref();
 return {
  stop(){for(const timer of [cleanupTimer,quizTimer,aiTimer,poemTimer,hanziTimer,audioTimer,shareImageTimer,deletionTimer,billingTimer])clearInterval(timer);},
  async drain(){await Promise.all([preparation,generation,poemWork,hanziWork,audioWork,cleanup,deletionWork,billingWork,...shareImageWorkers]);}
 };
}
