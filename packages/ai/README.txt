Wordmate 0.1 服务端 AI/TTS 适配层

现已实现：OpenAI Responses、千问 Chat Completions（JSON Schema）、Azure Speech REST。
统一 TextGenerator.generate 接口；TtsProvider 独立，不随大模型供应商切换。
其他供应商必须新增并验证适配器，不能仅换base_url就假设协议兼容。
当前是可供NestJS Worker调用的基础模块，未接业务HTTP路由、COS、数据库任务调度或完整题目/例句语义校验。

配置
项目根目录.env.example复制为.env，仅服务器加载；不要提交真实密钥或放进小程序。
LLM_PROVIDER=openai：读取OPENAI_API_KEY和OPENAI_MODEL，调用官方Responses API。
LLM_PROVIDER=qwen：读取QWEN_API_KEY、QWEN_MODEL、QWEN_BASE_URL。
两家凭证隔离，模型ID必填；不猜测账号可用模型，不静默切换或降级。
切换配置后重启Worker；新任务保存provider/model/prompt_version/schema_version快照，已有任务按原快照构建适配器（密钥仍从服务器取），不能在重试时悄悄换模型。业务Worker接入时落实该快照。
TTS_PROVIDER=azure：读取AZURE_SPEECH_KEY及AZURE_SPEECH_BASE_URL。
地域端点必须匹配Speech资源。支持全球云*.tts.speech.microsoft.com和中国云*.tts.speech.azure.cn，账号、目录及计费独立，不自动互换。
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
const audio = await tts.synthesize({ text: 'Our luggage arrived at the airport.', accent: 'en-GB', voiceId: 'en-GB-SoniaNeural', rate: 1.0 });
例中音色只是候选，必须在实际voices目录中存在。不会把英音失败自动改成美音。
音频由上层保存COS私有桶，API鉴权下载；audioCacheKey传入孩子范围、内容版本及含供应商/地域/策略版本的profile，避免串用音频。不得跨孩子复用私有句子。

测试
node --experimental-strip-types --test packages/ai/test/*.test.ts
8项离线测试使用注入fetch，无真实供应商调用、无费用；不代表账号开通、英语质量、实际声音或中国大陆延迟已经验证。
供应商异常只暴露稳定错误码，不回传原始响应或密钥；限次重试由持久任务层处理，适配器不自行叠加重试。

TTS选型决定：Azure Speech标准神经语音，暂不使用HD或语音克隆。
候选英音Sonia/Ryan，美音Jenny/Guy；以实际区域目录为准。
选择原因：有明确en-GB/en-US标签、标准神经音色、SSML语速控制及MP3输出，直接匹配产品需求。
全球Azure价格页目前列出F0每月50万字符神经TTS免费量；不等于付费S0也有相同赠额，且需核对账号/区域适用性。付费价随区域/币种/合同变化，本次未读取到可确认的统一单价，不承诺固定人民币成本。
国内部署须用实际服务器测试音色目录、首次合成P95和失败率；中国云目录不可假设与全球云一致。
同形异音词（read/lead等）必须按义项审核发音；目前适配器仅合成纯文本，不保证孤立词读音消歧。上线前需用已验证词典音频或扩展受控phoneme/lexicon策略，并把发音策略加入缓存版本；不能直接接受客户端SSML。

官方核查来源（2026-10-20）
https://developers.openai.com/api/docs/guides/structured-outputs
https://help.aliyun.com/zh/model-studio/qwen-structured-output
https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech
https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support
https://azure.microsoft.com/en-us/pricing/details/speech/
https://docs.azure.cn/en-us/ai-services/speech-service/sovereign-clouds
