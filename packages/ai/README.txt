Wordmate 0.1 服务端 AI/TTS 适配层

现已实现：DeepSeek Chat Completions（默认，JSON Object）、OpenAI Responses、千问 Chat Completions（JSON Schema）、阿里云CosyVoice北京HTTP。
统一 TextGenerator.generate 接口；TtsProvider 独立，不随大模型供应商切换。
其他供应商必须新增并验证适配器，不能仅换base_url就假设协议兼容。
当前是可供NestJS Worker调用的基础模块，未接业务HTTP路由、OSS、数据库任务调度或完整题目/例句语义校验。

配置
项目根目录.env.example复制为.env，仅服务器加载；不要提交真实密钥或放进小程序。
LLM_PROVIDER=deepseek（默认）：读取 DEEPSEEK_API_KEY、DEEPSEEK_MODEL；当前配置 deepseek-flash，固定官方 https://api.deepseek.com/chat/completions。关闭 thinking，使用 json_object，将 Schema 写入提示词，业务 validate 仍必须执行。JSON 模式不保证符合 Schema。
LLM_PROVIDER=openai：读取OPENAI_API_KEY和OPENAI_MODEL，调用官方Responses API。
LLM_PROVIDER=qwen：读取QWEN_API_KEY、QWEN_MODEL、QWEN_BASE_URL。
三家凭证隔离，模型ID必填；不猜测账号可用模型，不静默切换或降级。
切换配置后重启Worker；新任务保存provider/model/prompt_version/schema_version快照，已有任务按原快照构建适配器（密钥仍从服务器取），不能在重试时悄悄换模型。业务Worker接入时落实该快照。
TTS_PROVIDER=cosyvoice：读取COSYVOICE_API_KEY、COSYVOICE_WORKSPACE_ID及COSYVOICE_ENABLED_VOICES。
仅使用百炼北京地域，模型固定cosyvoice-v3-flash；更换模型须重新验证音色兼容性。音色接口返回配置白名单，并非实时账号目录；部署前逐个合成验证开通情况。
Node 23.11.0已用于本次测试；无运行时npm依赖，源代码为可剥离类型的TypeScript。正式NestJS工程仍须固定受支持Node/TypeScript版本并执行完整类型检查。

调用
import { createTextGenerator, createTtsProvider } from './src/index.ts';
const generator = createTextGenerator(process.env);
const result = await generator.generate({
  name: 'your_schema_name', schema: YOUR_JSON_SCHEMA,
  instructions: YOUR_SYSTEM_INSTRUCTIONS, input: YOUR_WORD_SENSE_DATA,
  validate: value => YOUR_SCHEMA_AND_SEMANTIC_VALIDATOR(value)
});
必须传validate；适配器处理拒绝、截断、JSON解析和校验失败，业务层负责词义、覆盖范围、唯一答案及UTF-16偏移的完整验证。strict模式也不能代替英语质量审核。
const tts = createTtsProvider(process.env);
const voices = await tts.listVoices();
const audio = await tts.synthesize({ text: 'Our luggage arrived at the airport.', accent: 'en-GB', voiceId: 'loongemily_v3', rate: 1.0 });
例中音色只是候选，必须在实际voices目录中存在。不会把英音失败自动改成美音。
音频由上层保存OSS私有桶，API鉴权下载；audioCacheKey传入孩子范围、内容版本及含供应商/地域/策略版本的profile，避免串用音频。不得跨孩子复用私有句子。

测试
node --experimental-strip-types --test packages/ai/test/*.test.ts
9项离线测试使用注入fetch，无真实供应商调用、无费用；不代表账号开通、英语质量、实际声音或中国大陆延迟已经验证。
供应商异常只暴露稳定错误码，不回传原始响应或密钥；限次重试由持久任务层处理，适配器不自行叠加重试。

TTS选型决定：国内阿里云百炼CosyVoice，北京地域cosyvoice-v3-flash。
官方明确标注英音loongemily_v3（女）/loongeric_v3（男），美音loongabby_v3（女）/loongandy_v3（男）。可只启用经过账号验证的子集；口音不符直接拒绝。
采用非流式HTTP合成，原生rate设置语速，MP3/24kHz；供应商返回临时下载地址，由服务端通过HTTPS获取后存私有OSS，小程序不接触供应商密钥或签名地址。
限定官方北京结果桶，禁止跳转，下载不携带API密钥，识别MP3头；若供应商未来变更桶域名，需要根据官方文档更新白名单，不能随意放开。
当前英美音色不支持SSML；文本按纯文本发送。同形异音词仍须实际试听和词典音频等可靠方案，不保证孤立词义项读音自动正确。
费用按百炼北京实际模型计费项和账号额度核对，Azure额度不再适用。未提供真实凭证，未产生收费调用或完成音质评测。

官方核查来源（2026-10-20）
https://developers.openai.com/api/docs/guides/structured-outputs
https://help.aliyun.com/zh/model-studio/qwen-structured-output
https://help.aliyun.com/en/model-studio/cosyvoice-voice-list
https://help.aliyun.com/zh/model-studio/cosyvoice-tts-http-api

DeepSeek 切换（2026-10-20）
本地 .env 保存供应商配置，Git 忽略，权限 0600。local-dev.cjs 在小程序构建完成后，仅给后端加载 .env 中的供应商字段。
最小真实连接验证返回 UPSTREAM_NETWORK_OR_TIMEOUT，未取得 HTTP 状态；尚不能确认密钥有效或模型可用。
批量生成音标、释义与例句的业务保存流程尚待接入。本次只完成供应商适配和配置。
官方来源：https://api-docs.deepseek.com/ 和 https://api-docs.deepseek.com/guides/json_mode/

批量词汇真实验收（2026-10-20）
运行 corepack pnpm test:ai:live。从项目根目录 .env 读取凭证，以 airport/luggage/delay 和机场旅行主题调用真实模型一次，不发送孩子资料。
新增 src/vocabulary.ts：固定提示词版本 vocabulary-0.1-1，返回英/美音标、词性、常用中文释义、关联英文例句及译文。不要求用户逐词确认；不可识别词返回 invalid，禁止编造内容。
校验数量、顺序、输入对应、字段集合、音标格式、中文字段、原词一致、例句包含目标词及异常项字段。格式校验不保证音标、翻译和英语教学质量，应对真实输出抽检。
离线测试共 12 项通过；真实调用在当前执行环境仍报网络错误，单独探测 DNS 得到 ENOTFOUND，无 HTTP 状态，不代表密钥无效。
结果写入 .local/ai-verification.json（Git 忽略），失败退出码为 1。
脚本验证供应商生成与校验，不调用业务数据库，不证明小程序录入或自动保存已接通。业务路由仍使用测试词库，下一阶段需接入批量生成与原子保存。
