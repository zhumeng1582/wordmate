# 单词小老师联网搜索配置

联网搜索默认不可用。服务端需显式配置北京百炼业务空间的 `TUTOR_SEARCH_API_KEY`、`TUTOR_SEARCH_WORKSPACE_ID`、`TUTOR_SEARCH_MODEL`（当前仅允许 `qwen-plus` 或 `qwen-flash`），以及逗号分隔的 `TUTOR_SEARCH_ALLOWED_DOMAINS`。仅使用经运营方检查、适合小学生的来源域名；如果未提供可用域名，服务拒绝搜索。应根据来源许可与用途单独核查内容和链接。

配置 `TUTOR_SEARCH_INPUT_YUAN_PER_MILLION`、`TUTOR_SEARCH_OUTPUT_YUAN_PER_MILLION` 和 `TUTOR_SEARCH_YUAN_PER_CALL`，分别表示输入、输出及每次搜索的人民币价格。三项均须由部署者按实际供应商合同核实，不应将默认示例价格用于正式环境；不配置时拒绝调用。系统预留最多 16000 输入 token、1000 输出 token 和一次搜索的费用，成功后按返回用量及每次搜索费用结算；调用未完成不扣家庭额度，费用不确定的调用标记为待核查。`TUTOR_SEARCH_DAILY_LIMIT` 限制每账号每天次数，默认 100，系统 AI 预算上限同样生效。

启用前需应用 028 数据库迁移，核实模型支持搜索、来源返回、固定来源站点及价格，在测试账户和微信真机上验证来源展示、链接复制、结算与失败处理。不要提交 API Key。
