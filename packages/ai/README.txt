Wordmate 0.1 服务端 AI/TTS 适配层

现已实现：OpenAI Responses、千问 Chat Completions（JSON Schema）、阿里云CosyVoice北京HTTP。
统一 TextGenerator.generate 接口；TtsProvider 独立，不随大模型供应商切换。
其他供应商必须新增并验证适配器，不能仅换base_url就假设协议兼容。
当前是可供NestJS Worker调用的基础模块，未接业务HTTP路由、COS、数据库任务调度或完整题目/例句语义校验。

配置
项目根目录.env.example复制为.env，仅服务器加载；不要提交真实密钥或放进小程序。
LLM_PROVIDER=openai：读取OPENAI_API_KEY和OPENAI_MODEL，调用官方Responses API。
LLM_PROVIDER=qwen：读取QWEN_API_KEY、QWEN_MODEL、QWEN_BASE_URL。
两家凭证隔离，模型ID必填；不猜测账号可用模型，不静默切换或降级。
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
音频由上层保存COS私有桶，API鉴权下载；audioCacheKey传入孩子范围、内容版本及含供应商/地域/策略版本的profile，避免串用音频。不得跨孩子复用私有句子。

测试
node --experimental-strip-types --test packages/ai/test/*.test.ts
8项离线测试使用注入fetch，无真实供应商调用、无费用；不代表账号开通、英语质量、实际声音或中国大陆延迟已经验证。
供应商异常只暴露稳定错误码，不回传原始响应或密钥；限次重试由持久任务层处理，适配器不自行叠加重试。

TTS选型决定：国内阿里云百炼CosyVoice，北京地域cosyvoice-v3-flash。
官方明确标注英音loongemily_v3（女）/loongeric_v3（男），美音loongabby_v3（女）/loongandy_v3（男）。可只启用经过账号验证的子集；口音不符直接拒绝。
采用非流式HTTP合成，原生rate设置语速，MP3/24kHz；供应商返回临时下载地址，由服务端通过HTTPS获取后存私有COS，小程序不接触供应商密钥或签名地址。
限定官方北京结果桶，禁止跳转，下载不携带API密钥，识别MP3头；若供应商未来变更桶域名，需要根据官方文档更新白名单，不能随意放开。
当前英美音色不支持SSML；文本按纯文本发送。同形异音词仍须实际试听和词典音频等可靠方案，不保证孤立词义项读音自动正确。
费用按百炼北京实际模型计费项和账号额度核对，Azure额度不再适用。未提供真实凭证，未产生收费调用或完成音质评测。

官方核查来源（2026-10-20）
https://developers.openai.com/api/docs/guides/structured-outputs
https://help.aliyun.com/zh/model-studio/qwen-structured-output
https://help.aliyun.com/en/model-studio/cosyvoice-voice-list
https://help.aliyun.com/zh/model-studio/cosyvoice-tts-http-api
