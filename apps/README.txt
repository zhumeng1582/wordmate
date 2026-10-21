本地运行更新：优先参阅根目录 LOCAL-RUN.txt。新增 PGlite 持久化开发数据库和 node scripts/local-dev.cjs 一键构建启动，不再要求本地安装 Docker/PostgreSQL。持久化适配器已测试，前后端编译与类型检查已通过；真实 FSRS 及 Nest 路由测试通过，端口连接与微信模拟器操作尚待用户终端联调。

单词共学 0.1 · 开发工程

状态（2026-10-20）
已经开始实现；当前为录词与复习主流程的开发切片，不是全部 0.1 功能完成，也不是可上线版本。
前端：Taro 4 + React 18 + TypeScript，微信原生小程序产物。
后端：NestJS 11 + TypeORM（显式 SQL 事务）+ PostgreSQL 16。
调度：ts-fsrs 5.2.3，保留完整卡状态及版本，禁止缺依赖时用假算法运行。
部署方向仍为阿里云；本次没有上传云端、Figma、蓝湖或建立公开仓库。

目录
apps/api/src/core.ts：与框架解耦的业务与权限事务。
apps/api/src/main.ts：HTTP 入口、服务端登录、错误脱敏。
apps/api/src/validation.ts：本轮已实现请求的严格 DTO 校验。
apps/api/test/core.test.ts：真实 SQL 引擎的端到端业务事务测试。
apps/miniapp：首页、设置、家庭、词本、复习、月测、日历和错题等10个页面；AppID 已填入 project.config.json。
packages/ai：DeepSeek（默认）/OpenAI/Qwen 和阿里云 CosyVoice 适配器。
infra/compose.yaml：只绑定本机的 PostgreSQL 开发配置。
deliverables/0.1/database/001_schema.sql：数据库的初始迁移唯一来源。

已实现业务
- 微信 code 换登录会话；令牌只存哈希。明确独立的开发登录路由。
- 创建家庭、选择孩子、保存口音偏好；单词、例句、复习页支持英美音播放及已配置声音选择。
- 管理员创建邀请口令、另一家长领取、管理员批准后才取得家庭权限。
- 创建单词本、最多30词AI生成并自动保存；旧候选确认接口仅保留兼容。
- AI批量录词、自动保存音标/释义/例句与复习卡；后台持久任务、部分重试和模型配置快照。详见 AI-VOCABULARY.txt。
- 今日复习快照、120 秒陪学租约、30 秒心跳、四档自评。
- 复习事件持久去重；原子更新卡片、每日词数、错题事实。
- 页面答案失败重试保留 event_id，刷新后可恢复；不会显示假的保存成功。
- 权限检查在幂等响应重放前执行；邀请码只存哈希（幂等响应快照保存口令，需按保留期清理）。

尚未实现/未验收
- 完整接口文档中的所有操作；当前响应是开发切片，尚未完全符合最终 OpenAPI（例如通用词列表分页、部分 Session actor 字段）。禁止把最终 OpenAPI 当成本次所有接口均已上线。
- 任意句中点词查询。TTS/私有OSS缓存/鉴权下载及播放入口已接入，云端完整业务联调和微信播放待验收，详见 deliverables/0.1/technical/audio-pipeline.txt。
- 权威词典查询尚未接入；录词已改用AI，不再限制10个测试词，明确标注AI来源。
- 更丰富月测题型及教学质量评测、分享、导出、标注/纠错。日历与错题集已实现，达标自动打卡。
- 月测开发流程已接入：抽样/全量、四档成绩、历史与本次错题；详见 MONTHLY-QUIZ.txt。
- 日常复习接管、设置更新、成员退出移除与账号/家庭删除。
- 完整鉴权限流、审计与日志脱敏演练、运营监控、后台管理、线上备份恢复。
- 小程序生产隐私配置、服务类目核验、合法域名、ICP备案和真机验收。
- 当前词列表暂限 200 项；单卡揭示词义通过独立授权查询，不受列表截断影响。

本机启动（依赖网络恢复后）
1. 安装受支持的 Node.js LTS 和 pnpm 10；在仓库根目录执行 pnpm install。
   依赖已完成首次安装，pnpm-lock.yaml 已生成；后续优先使用 corepack pnpm install --frozen-lockfile。
2. 复制 .env.example 为 .env，仅在本地填写 DATABASE_URL。
   开发需 NODE_ENV=development、AUTH_MODE=development、DICTIONARY_PROVIDER=fixture。
   开发身份被限制在后端绑定 127.0.0.1；严禁修改为公网开发登录。
3. 启动 PostgreSQL 16（已有服务器也可）。Docker 开发可执行：
   export POSTGRES_PASSWORD='自行设置的本地密码'
   docker compose -f infra/compose.yaml up -d
   DATABASE_URL 的密码需要与上面一致。
4. pnpm --filter @wordmate/api build
   pnpm --filter @wordmate/api migrate
   pnpm --filter @wordmate/api start
   migrate 仅适用于空库；发现 wordmate schema 会拒绝执行。没有自动同步或删表。
5. 另开终端在根目录执行：
   MINIAPP_DEV_AUTH=true MINIAPP_API_BASE=http://127.0.0.1:3000/api pnpm dev:miniapp
   微信开发者工具导入 apps/miniapp，使用已填 AppID。
   仅本地开发时，工具里关闭合法域名校验；project.config.json 默认保持 urlCheck=true。
6. 页面顺序：开发登录爸爸 → 创建家庭 → 添加孩子 → 选择孩子 → 单词本 → 建本 → 添加 apple/book → 确认 → 首页复习。
   妈妈通过独立开发身份领取口令，爸爸审批后妈妈再刷新家庭列表。

测试
pnpm test:core
pnpm test:ai
pnpm --filter @wordmate/api build
pnpm --filter @wordmate/miniapp typecheck
pnpm build:miniapp

当前实际验证边界
用户已安装依赖和微信开发者工具。Nest/Taro 编译与类型检查通过；当前代理环境禁止监听 TCP 端口，完整网络联调及微信模拟器/真机操作待验证。
使用 PGlite 运行了完整迁移与核心集成测试；分别覆盖调度替身和真实 ts-fsrs，并验证家庭权限、确认回滚、事件去重、会话过期和错题入库。
8 个模型/TTS 适配器离线测试通过；没有调用收费外部服务。
后端和小程序已完成语义类型检查；Nest/Express 进程内路由验收通过，包含请求解析、DTO 校验和真实 FSRS。
生产前必须完成上述未验收项，不得将开发身份或测试词典带到正式环境。

生产凭证
AppSecret、OpenAI Key、阿里云 CosyVoice Key、OSS/数据库凭证只能在服务器环境注入。
小程序的 MINIAPP_API_BASE、MINIAPP_DEV_AUTH 是构建参数；正式包必须关闭 DEV_AUTH 并使用已备案的 HTTPS 合法域名。
微信 AppID 是公开标识，允许入 Git。不要在聊天中粘贴 AppSecret。

家庭页视觉修正（2026-10-20）
本地参考稿：deliverables/0.1/design/screens/28-family.png。
家庭页改为成员卡、孩子档案与底部邀请入口；表单和开发账号切换按需展开。
成员列表由授权接口返回，设计稿示例姓名不写入真实界面。
统一按钮使用显式 .btn 类，避免 Taro 把标签选择器转成 .h5-button 导致微信按钮样式失效。
输入框设置明确高度、取消垂直内边距，修复文字裁切；禁用按钮保留可读文字。
本轮未完成其余所有页面逐稿还原，也未完成新版家庭页的微信模拟器截图对比。
后端新增家庭成员查询接口，查看新版页面前需重启本地后端。

月测实现更新：见 apps/MONTHLY-QUIZ.txt。首页新增按月测验入口，所有功能仍属于0.1。家庭新版已由用户确认报错解决，月测已由用户确认验收通过。
日历与错题复习已实现，新增接口、规则及验收清单见 CALENDAR-REVIEW.txt；这一轮新页面待模拟器验收。

本轮已接通AI录词业务流程，运行与测试说明见 AI-VOCABULARY.txt。

家庭邀请分享（0.1）
“我的 → 邀请另一位家长”先生成邀请，再展示“分享邀请卡片给朋友”和“复制邀请口令”，二者使用同一邀请。分享调用微信原生 openType=share，由用户选择收件人，程序不自动发送、不把取消分享当作发送成功。
卡片使用包内固定PNG（scripts/generate-invite-cover.swift可重建），不截图家庭/孩子数据。标题不含个人信息。仅按钮分享携带邀请口令；右上角普通分享指向首页。
落地页 pages/invite/index?token=… 只接受43位base64url口令；不直接展示家庭资料、不自动领取。未登录先登录，登录后点击申请；由现有 claim/approve 接口执行24小时有效期、单次领取、成员权限和管理员审批。口令不写新增本地存储或日志；API现有网络重试缓存可能在未确认提交时保存请求体，确认后删除。
开发者工具可用有效邀请口令配置启动路径 pages/invite/index 和参数 token=口令，切换妈妈身份测试申请。请勿把真实口令提交Git。微信好友收卡需在真机和可访问的后端环境验收；本地127.0.0.1不能作为另一台手机的服务器地址。
参考：https://docs.taro.zone/docs/hooks/#useshareappmessage

音频缓存优先流程（0.1，实施规格）
完整流程和账号资料清单：deliverables/0.1/technical/audio-pipeline.txt。配置模板：config/audio.env.example。OSS最小权限模板：config/oss-audio-policy.template.json（替换桶名后交给RAM身份；不授权删除或列举整个桶）。
当前仅TTS适配器可用，业务Worker/OSS/小程序播放尚未接入；模板中的OSS与限额字段暂不生效。没有执行数据库迁移或收费调用。

0.1 界面更新：五个学习管理入口及发音设置集中到“设置”页；首页保留今日学习和设置入口。全应用支持微信自动浅/深色主题，无手动主题开关。详见 LOCAL-RUN.txt 的验收步骤。

交互精简约定（0.1，2026-10-21）
- 首页突出学习进度；管理功能统一从设置进入。开发说明放在设置底部。
- 不新增页面或弹窗；无可选项时不显示选择器，纯说明不用独立卡片。
- 发音偏好仅修改后显示保存，试听无需先保存；外观自动跟随微信。
- 家庭页保留孩子档案和邀请的唯一主要入口；日历专注日期与错词。
- 保存状态不确定时保留原请求重试；交卷、放弃和权限接管保留确认。
- 首页点击开始复习后在同一页显示单词，结束后刷新今日进度；不再显示第二次开始/恢复选择。
- 复习自动恢复本机有效会话，仅明确过期/不存在时重新创建；网络或权限错误保留原会话供重试。
- 日历/月测错词入口复用相同复习组件；未确认的答案优先处理，月测答题流程不变。
- 会话入口验证：node --experimental-strip-types --test apps/miniapp/test/review-entry.test.ts
- 验收：首页加载/失败不显示新建家庭引导；试听与保存；家庭邀请与选孩子；
  单词录入与生成记录；月测答题卡和全对成绩；日历到错词复习；微信深浅主题。

错题日期范围（0.1）
- 日期入口打开月历弹层，第一次点击选开始，第二次选结束（逆序自动排序），第三次重新开始。
- 可跨月、同日选择；确定应用，取消/点遮罩不修改，全部日期清除筛选。
- GET /children/{id}/wrong-words 新增 date_from、date_to，均为 YYYY-MM-DD，包含首尾日期。
  必须成对提供且开始不晚于结束；与旧 date 参数互斥；source 与 cursor 分页可组合。
- 旧 date 单日接口仍兼容；多日结果通过选中单词发起复习，单日保留整日复习入口。

单词本与录入（0.1）
- 单词本默认展示单词和音标，点击条目展开释义及例句；一次展开一项，再点收起。
- 音标与例句点击播放，不触发条目折叠。
- 右上角“添加单词”进入独立录入页；生成记录与失败任务重新编辑位于此路径。
- 录入保留原请求重试及原任务覆盖逻辑；返回词本后自动刷新生成中的内容。

学习目标（0.1）
- 设置中按当前孩子配置 5/10/20/30 或自定义 1–500，每日新词上限保持原配置。
- GET/PUT /children/{id}/learning-goal：PUT 传 daily_goal、expected_version 和 Idempotency-Key。
- 家庭有效成员可读写；版本冲突返回 LEARNING_GOAL_CHANGED，刷新后重选。
- 返回 child_id、nickname、daily_goal、today_goal、effective_from、version。
- 开始有效复习时冻结当天 daily_activity.goal_snapshot；当日后续修改次日起生效。
- 不新增表；保留已有学习记录、历史打卡和当日目标，首页返回时刷新进度。

复习卡片：音标与词性同行，无分隔线。点击查看词义后，通过单词详情接口的 example（id、content_version、translation_zh）显示对应例句译文；复习队列接口继续隐藏中文答案。
