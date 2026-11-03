const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
for(const legacy of [false,true]) test(legacy?'sharing remains compatible with an older server':'sharing uses a bundled background and sends the complete poster as an image',async()=>{
 const slots=[],effects=[],requests=[],draws=[],shared=[];let cursor=0,mounted=false;
 const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=v}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(fn){if(!mounted)effects.push(fn);},createElement(type,props,...children){return {type,props:{...props,children}};},Fragment:'fragment'};
 const taro={env:{USER_DATA_PATH:'/tmp'},getFileSystemManager:()=>({writeFileSync(){}}),useDidHide(){},nextTick(fn){fn();}};
 const services={storage:{get:key=>key==='access_token'?'token':'child'},api:async(path,method,data)=>{requests.push({path,method,data});if(path==='/me/referral-code-image')return {code:'0123456789abcdef',base64:'aGVsbG8=',mime:'image/png'};if(legacy&&data.local_poster)throw Object.assign(Error('INVALID_REQUEST_BODY'),{status:422});return {date:'2026-10-31',studied_words:10,goal:10,checked_in:true,streak_days:1,quotes:[{en:'Hello',zh:'你好'}]};}};
 const renderPoster=async(...args)=>{draws.push(args);return '/tmp/full-poster.png'};
 const module={exports:{}};
 // React JSX uses the automatic runtime in the application build.
 const automatic=ts.transpileModule(fs.readFileSync('apps/miniapp/src/components/useCheckinShare.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const jsx={Fragment:'fragment',jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 vm.runInNewContext(automatic,{module,exports:module.exports,wx:{showShareImageMenu:options=>shared.push(options.path)},Math,Promise,require:name=>name==='react'?react:name==='react/jsx-runtime'?jsx:name==='@tarojs/taro'?taro:name==='@tarojs/components'?{Canvas:'canvas'}:name.includes('CheckinSharePreview')?{CheckinSharePreview:'preview'}:name.includes('share-poster')?{renderSharePoster:renderPoster}:name.includes('generated/checkin-share')?{checkinShareRequest:(date,local)=>local?{date,local_poster:true}:{date}}:services});
 function render(){cursor=0;const value=module.exports.useCheckinShare('2026-10-31');mounted=true;return value;}
 let value=render();effects.forEach(fn=>fn());await value.openShare();value=render();
 assert.equal(requests[0].path,'/me/referral-code-image');assert.equal(requests[1].data.local_poster,true);assert.equal(requests.length,legacy?3:2);if(legacy){assert.equal(requests[2].data.date,'2026-10-31');assert.equal('local_poster' in requests[2].data,false);}assert.equal(draws[0][5],'/tmp/referral-0123456789abcdef.png');assert.match(draws[0][4],/^\/assets\/share-posters\/.+\.jpg$/);assert.equal(draws[0][3],false);
 const preview=value.content.props.children.find(x=>x&&x.type==='preview');assert.equal(preview.props.image,'/tmp/full-poster.png');preview.props.onShare();assert.deepEqual(shared,['/tmp/full-poster.png']);
});
