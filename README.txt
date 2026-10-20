词伴 Wordmate — 0.1 私有项目

入口：deliverables/0.1/index.html
所有功能版本均为0.1；当前为需求、设计、接口、数据库与检查源码，尚无真实业务后端或小程序工程。

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

Git管理
当前沙箱禁止写项目.git目录，自动初始化被系统拒绝，因此尚未产生Git提交。
请在本机终端执行：
  cd /Users/mac/Desktop/word
  sh scripts/init-git.sh
脚本初始化main并提交所有当前文档、源码、SVG/PNG、交付ZIP与生成副本；忽略缓存、环境变量及私钥文件。使用本机已有Git提交身份。
脚本不创建远程仓库，不推送，不上传Figma或蓝湖。
执行成功后用git status、git log -1核对；后续修改在独立提交中记录。
