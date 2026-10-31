# 生产部署准备（模板，需由运营者填入实际资源）

## 配置检查

在服务端安全注入生产环境变量后执行 `corepack pnpm check:production-env`。该检查只输出缺失配置名，不会打印密钥。检查通过前不能启动正式服务或构建正式小程序。

小程序需使用 `MINIAPP_API_BASE=https://备案域名/api` 构建：

```sh
MINIAPP_API_BASE=https://备案域名/api corepack pnpm build:release
```

服务端以 `NODE_ENV=production`、`AUTH_MODE=wechat` 运行，仅使用 PostgreSQL、微信真实登录、已启用的 AI/视觉/语音服务和生产 OSS 前缀。开发库、fixture 身份、测试密钥与 staging OSS 路径不得进入生产环境。

## 反向代理

`infra/nginx.wordmate.conf.example` 提供 TLS、7 MiB JSON 导入请求上限、最长 75 秒上游等待、登录及 API 基础限流模板。部署时替换域名和证书路径，验证 `nginx -t`，确认来源 IP 只信任自己的负载均衡器，并确保 API 端口仅在回环或私有网络可访问。限流区是单机 Nginx 级保护；多实例部署还需在统一网关配置共享限额。

## 数据和恢复

生产数据库使用单独的 PostgreSQL 实例与账号；启用自动备份并安排首次恢复演练。每次迁移前备份，按仓库迁移顺序升级；回滚应通过恢复备份演练，不在生产直接重放空库初始化 SQL。对象存储使用独立生产 bucket/prefix 和最小 RAM 角色，仅对实际音频/海报前缀授权所需的 `GetObject`、`PutObject` 与 `DeleteObject`；禁止匿名读。

## 上线验收证据

发布记录应包含：正式域名证书/合法域名检查、生产配置检查结果（不含密钥）、数据库迁移与恢复结果、AI/图片/语音/OSS实测、服务启动与停止、队列恢复、微信 Android/iOS 真机流程、隐私授权拒绝与重试、导出/分享验收、监控告警验证和回滚联系人。不要把本地构建或供应商单点测试当作生产验收。

## 尚需人工/平台操作

- 阿里云 ECS/RDS、VPC、安全组、域名备案、TLS证书、生产 OSS bucket/prefix/RAM角色和备份策略。
- 微信后台 request/downloadFile 域名、隐私接口、备案、服务类目、真实登录密钥和审核提审。
- 运营主体联系方式、数据保留周期、儿童监护人同意文本与真实处理渠道。
- 更换曾在聊天中暴露的第三方服务密钥；只在服务端安全配置中更新。

## 隐私和删除升级（2026-10-24）

先停止旧 Worker 并备份，编译 API 后应用迁移 `015_privacy_lifecycle.sql` 与 `016_security_integrity.sql`（`corepack pnpm --filter @wordmate/api migrate:privacy`；前置迁移须完成）。本地 PGlite 重启自动补齐。生产政策配置 `PRIVACY_OPERATOR_NAME`、`PRIVACY_CONTACT`、`PRIVACY_BACKUP_RETENTION_DAYS` 缺失时不能接受同意；非 Qwen 文本模型另须处理地区与政策链接。

备份恢复必须先重放独立保存的最新删除清单，再恢复公开请求。配置导出调度与清理权限，详见仓库根目录 `PRIVACY-AND-DELETION.txt`。当前代码与本地隔离测试不能替代生产文件删除权限及真实备份恢复演练。

## 本次安全修复部署顺序

已经升级到 015 的 PostgreSQL：先备份、停止旧 API/Worker，运行 `corepack pnpm build:api` 和 `corepack pnpm --filter @wordmate/api migrate:security`，确认 016 成功后启动新 API/Worker。新预算表必须先于新版任务处理上线。016 回填仍存在的近期消费记录，清除没有实际学习支持的未使用补签奖励，保留已使用的历史补签；无法重建此前已经删除的消费/孤儿文件记录。

ECS 角色凭证仅使用固定元数据地址的 IMDSv2，要求有效 `OSS_RAM_ROLE_NAME`，不需要配置长期 AccessKey；请求失败不回退普通元数据模式或静态密钥。正式 ECS 上仍须验证角色权限、临时凭证续期、内网元数据连通性及私有桶读写删除。

请求解析器固定到 body-parser 2.4.0，入口在鉴权及解码前拒绝压缩请求，同时使用 inflate:false。客户端发送普通 JSON。`corepack pnpm test:security:http` 使用临时本机端口和隔离开发库验证畸形压缩输入，结束后自动关闭清理。
