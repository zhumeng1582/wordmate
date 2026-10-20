const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..');const screens=fs.readFileSync(path.join(root,'design/screens.json'),'utf8');
const nodes={};const node=id=>nodes[id]||(nodes[id]={textContent:'',innerHTML:'',scrollTop:0,dataset:{},classList:{toggle(){}}});node('screen-data').textContent=screens;
const events={};const document={getElementById:node,querySelectorAll:()=>[],querySelector:()=>node('aside'),addEventListener:(k,f)=>events[k]=f,createElement:()=>({click(){}})};
const ctx=vm.createContext({document,history:{replaceState(){}},location:{hash:''},setTimeout(){},alert(){},Blob,URL});
vm.runInContext(fs.readFileSync(path.join(root,'design/prototype.js'),'utf8'),ctx);
const click=data=>events.click({target:{closest:()=>({dataset:data})}});
for(const [correct,grade]of [[5,'待加强'],[6,'合格'],[8,'良好'],[9,'优秀'],[10,'优秀']]){
 click({action:'startQuiz'});
 vm.runInContext(`state.answers={};paper.forEach((q,i)=>{if(i<${correct})state.answers[i]=q[1];});`,ctx);
 click({action:'submitQuiz'});assert(node('screen').innerHTML.includes(grade));assert(node('screen').innerHTML.includes((correct*10).toFixed(1)+'分'));
}
click({to:'quiz'});assert.equal(vm.runInContext('state.screen',ctx),'quiz_results');
events.change({target:{dataset:{flag:'easy'},checked:true}});assert.equal(vm.runInContext('state.flags.error_prone',ctx),false);
const defs=JSON.parse(screens);const ids=new Set(defs.map(x=>x.id));
for(const s of defs){assert(ids.has(s.to),s.id);for(const c of s.cards)if(c.to)assert(ids.has(c.to),s.id);for(const x of s.secondary)assert(ids.has(x[1]),s.id);}
const report={checks:['原型月测50/60/80/90/100分四档判定','原型交卷后禁止返回可修改作答页','原型简单/易错标注互斥','46页主按钮/次按钮/卡片路由完整'],limitations:['使用Node VM验证原型事件逻辑，未替代真实浏览器和微信真机测试。']};fs.writeFileSync(path.join(__dirname,'prototype-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
