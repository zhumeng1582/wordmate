const fs=require('node:fs');
const {Privacy}=require('../apps/api/dist/privacy.js');
const policy=new Privacy({},process.env).policy;
const lines=['# 单词共学隐私政策',`版本：${policy.version}`,policy.publishable?'配置已补齐，仍需运营者核实第三方条款、部署和平台指引后发布。':'**当前为草案：运营者、联系渠道或备份期限等发布配置尚未补齐。**',`运营者：${policy.operator}`,`联系渠道：${policy.contact}`,'本文件由 scripts/render-privacy-policy.cjs 根据服务端同一政策源生成；生效日期以正式发布公告为准。'];
for(const section of policy.sections)lines.push(`## ${section.title}`,section.text);
lines.push('## 第三方政策链接',...policy.providers.map(p=>`- [${p.name}](${p.url})`));
fs.writeFileSync('deliverables/0.1/legal/privacy-policy-draft.md',lines.join('\n\n')+'\n');
console.log('Privacy policy draft synchronized from runtime source; no credentials printed.');
