本地运行更新：优先参阅根目录 LOCAL-RUN.txt。新增 PGlite 持久化开发数据库和 node scripts/local-dev.cjs 一键构建启动，不再要求本地安装 Docker/PostgreSQL。持久化适配器已测试，完整编译仍等待依赖安装。

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
apps/miniapp：家庭、词本、复习页面；AppID 已填入 project.config.json。
packages/ai：既有 OpenAI/Qwen 和阿里云 CosyVoice 适配器。
infra/compose.yaml：只绑定本机的 PostgreSQL 开发配置。
deliverables/0.1/database/001_schema.sql：数据库的初始迁移唯一来源。

已实现业务
- 微信 code 换登录会话；令牌只存哈希。明确独立的开发登录路由。
- 创建家庭、选择孩子、选择英音/美音（保存偏好，尚无播放按钮）。
- 管理员创建邀请口令、另一家长领取、管理员批准后才取得家庭权限。
- 创建单词本、最多 30 词查询候选、逐项确认或跳过、跨批去重。
- 录词成功后创建例句任务；还没有消费该队列的 worker，界面明确显示尚未启用。
- 今日复习快照、120 秒陪学租约、30 秒心跳、四档自评。
- 复习事件持久去重；原子更新卡片、每日词数、错题事实。
- 页面答案失败重试保留 event_id，刷新后可恢复；不会显示假的保存成功。
- 权限检查在幂等响应重放前执行；邀请码只存哈希（幂等响应快照保存口令，需按保留期清理）。

尚未实现/未验收
- 完整接口文档中的所有操作；当前响应是开发切片，尚未完全符合最终 OpenAPI（例如 Today 的 streak/check-in、完整 Word DTO、分页、Session actor 字段）。禁止把最终 OpenAPI 当成本次所有接口均已上线。
- AI 任务消费、例句校验与点词查询；TTS 音频生成/私有 OSS 缓存/播放。
- 正式词典授权和接入。开发词库仅 10 词，不使用 AI 冒充词典。
- 月测抽样/全量、四等级评分、错题日历、主动打卡、分享、导出、标注/纠错。
- 复习接管、日历/手动/测验来源、设置更新、成员退出移除与账号/家庭删除。
- 完整鉴权限流、审计与日志脱敏演练、运营监控、后台管理、线上备份恢复。
- 小程序生产隐私配置、服务类目核验、合法域名、ICP备案和真机验收。
- 当前词列表暂限 200 项；单卡揭示词义通过独立授权查询，不受列表截断影响。

本机启动（依赖网络恢复后）
1. 安装受支持的 Node.js LTS 和 pnpm 10；在仓库根目录执行 pnpm install。
   当前环境尚未完成首次安装，因此没有伪造 pnpm-lock.yaml。安装成功、验证兼容性后应提交真实锁文件。
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
本机 npm DNS 失败，pnpm/Docker 不可用；没有完成 Nest/Taro/ts-fsrs 安装、构建或微信真机联调。
利用本机已有 PGlite 运行了完整迁移与核心集成测试；测试使用明确标注的调度替身，只证明事务/权限/去重，不证明真实 FSRS 输出。
8 个模型/TTS 适配器离线测试通过；没有调用收费外部服务。
所有新 TS/TSX 文件完成语法转译检查；这不替代安装依赖后的语义类型检查。
生产前必须完成上述未验收项，不得将开发身份或测试词典带到正式环境。

生产凭证
AppSecret、OpenAI Key、阿里云 CosyVoice Key、OSS/数据库凭证只能在服务器环境注入。
小程序的 MINIAPP_API_BASE、MINIAPP_DEV_AUTH 是构建参数；正式包必须关闭 DEV_AUTH 并使用已备案的 HTTPS 合法域名。
微信 AppID 是公开标识，允许入 Git。不要在聊天中粘贴 AppSecret。
