词伴 Wordmate — 0.1 私有项目

入口：deliverables/0.1/index.html
所有功能版本均为0.1；包含需求、设计、接口、数据库、AI/TTS适配器以及开发中的后端和小程序工程；完整0.1尚未全部实现。

唯一编辑源：deliverables/0.1/
  tools/content.py        PRD、技术方案、权限规则
  api/openapi.json        接口契约
  database/001_schema.sql 空库初始迁移（不能重跑已有库）
  tools/design.py         页面定义与SVG生成
  design/prototype.js     本地原型交互
  build.py                从上述源生成HTML文档
  checks/                 数据库/契约/原型检查
  tools/package.py        生成manifest、ZIP并同步现有解压副本
不要手工修改deliverables/wordmate-0.1/，它是生成副本。

2026-10-20 评审修订
- 唯一家长可明确解散家庭，完成后注销；有其他有效成员时必须先转交或明确移除。
- 新增独立lifecycle_jobs；目标删除后仍能按发起者本人查询/重试，恢复备份时重放删除清单。
- 例句正文、译文及锁定操作仅管理员可修改；普通家长提交建议。
- 新增4张生命周期设计图，总计46页；29张表、85个接口、58个Schema。
- 技术文档增加工程版本、词典授权、AI/TTS实际接入及FSRS基准样例的开工验收清单。

检查及重建（项目根目录）
  python3 deliverables/0.1/tools/design.py
  python3 deliverables/0.1/tools/prototype.py
  node deliverables/0.1/checks/validate.cjs
  node deliverables/0.1/checks/prototype.cjs
  python3 deliverables/0.1/build.py
  swift -module-cache-path /private/tmp/wordmate-swift-cache deliverables/0.1/tools/render.swift deliverables/0.1/design/screens/*.svg
  python3 deliverables/0.1/tools/check_delivery.py
  python3 deliverables/0.1/tools/package.py
检查脚本目前使用本机firebase-tools附带的pglite-2及ajv；其他机器须通过WORDMATE_CHECK_DEPS指向含同名包的依赖目录。Swift图片生成需macOS AppKit。正式业务工程版本与lockfile按开工清单固定，不能把上述环境当作已经锁定的业务依赖。

AI/TTS适配源码
packages/ai/src/index.ts：OpenAI/千问切换及国内CosyVoice实现。
packages/ai/README.txt：配置、集成、验证边界和TTS选型来源。
.env.example：无真实密钥的服务端配置模板。
运行：node --experimental-strip-types --test packages/ai/test/*.test.ts

Git管理
项目已有本地Git仓库，main分支初始提交e190a09。
后续文档、源码和生成资源统一提交；.env等密钥文件保持忽略。
不自动创建远程仓库或上传私有项目。

部署约定：个人主体微信小程序；基础设施用本人阿里云账号。开发本地运行，生产使用 ECS、RDS PostgreSQL 和私有 OSS。2026-10-30 已完成 api.dancigongxue.world 的 HTTPS 与新版后端部署，记录见 SERVER-DEPLOYMENT-2026-10-30.txt；服务类目、微信代码审核和真机业务验收仍按发布流程完成。

微信账号准备状态
用户已申请个人主体开发者账号，AppID：wxcf7d28bc513949d4。
公共配置记录在config/wechat.json；后端配置模板为.env.example中的WECHAT_APP_ID/WECHAT_APP_SECRET。
Taro工程已接入该AppID；本地开发身份可运行，正式微信登录仍需AppSecret及环境验收。
AppSecret已安全配置在服务端，不提交仓库。用户已确认小程序与域名备案通过，并于2026-10-30确认微信后台 request/downloadFile 合法域名保存为 https://api.dancigongxue.world；代码提审、正式发布及真机业务验收尚待完成。

2026-10-20 开发进度
已新增 apps/api 与 apps/miniapp，开始实现 0.1 的家庭、录词、复习主流程。
启动步骤、实际测试边界和未完成功能见 apps/README.txt。
依赖安装、前后端编译与类型检查已通过；家庭与月测已由用户验收；正式发布和真机验收尚未完成。
日历、错题集与额外复习已接入，当前状态与验收步骤见 apps/CALENDAR-REVIEW.txt。

AI录词自动保存已实现：见 apps/AI-VOCABULARY.txt。默认使用千问（Qwen 3.7 Flash），保留 OpenAI/DeepSeek 显式切换；图片识别与词条生成可在同一模型请求完成，不再要求逐词确认。

发布准备（未达到公开发布标准）：
  deliverables/0.1/technical/release-audit.txt 是当前阻断项和验证记录。
  deliverables/0.1/legal/privacy-policy-draft.md 是依据现有数据流整理的政策草案，运营者信息和保留期限未补前不能对外发布。
  deliverables/0.1/legal/production-operations.md 与 infra/nginx.wordmate.conf.example 提供生产环境模板。
  配置生产密钥后运行 corepack pnpm check:production-env；该检查仅打印缺失项名称。

首发范围与隐私（2026-10-24）
家庭共学、家长邀请、脱敏成果卡和用户主动 CSV 转发保留。公开词本发布/发现/预览/加入已关闭，历史副本和停止/退出可用；见 FIRST-RELEASE-SHARING-SCOPE.txt。隐私同意、撤回、受限数据管理登录及删除流程见 PRIVACY-AND-DELETION.txt。运营者/联系渠道/备份期限未补齐前，政策仍是草案。

安全修复与回归
本次 R01–R10 和家庭切换/标注锁顺序修复见 SECURITY-FIXES-2026-10-24.txt；旧库上线前停止旧 Worker，备份并执行 migrate:security 升级到 016。corepack pnpm test:security 为隔离回归，test:security:http 为临时本机 HTTP 验证。

2026-10-26 AI 双模式与充值
设置 → AI 与用量：系统 AI 余额/冻结/按 Token 结算、自带 Key（千问/DeepSeek/OpenAI）、自选文本模型、Key 删除与连接测试、最近调用和账目。词汇与图片调用接入账户配置；打卡文案默认精选，语音继续使用独立限额。
系统单价与余额未配置时拒绝系统调用；不再无条件消耗平台额度。充值默认关闭，按小程序“虚拟支付”接入，需后台开通、发布档位并配置正式密钥及 AES 回调后联调。已有库执行迁移 017。
完整配置、计费边界与微信开通步骤：deliverables/0.1/technical/ai-accounts.txt。
验证：corepack pnpm test:ai-accounts。未进行真实收费调用或真实支付验证。

2026-10-26 家庭共享与双模态升级（覆盖上一节个人钱包规则）
默认系统模型；文字和图片模型独立设置，图片支持千问和 OpenAI。每家庭一次性赠送 20 元，余额、冻结、系统消费和充值由有效成员共享，私有 Key 按家长及模态隔离。迁移 018 幂等补发已有家庭并保留/迁移旧个人资金；本地 4 个家庭已各到账 20 元（迁移前已备份），其他部署库需升级。当前精确北京千问模型内置已核查阶梯价格。详见 deliverables/0.1/technical/ai-accounts.txt。
