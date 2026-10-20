from pathlib import Path
import sys,json,re,html,zipfile
R=Path(__file__).parent;sys.path.insert(0,str(R/'tools'))
from content import FEATURES,PRD,TECH,PERMISSIONS
E=lambda s:html.escape(str(s))
api=json.loads((R/'api/openapi.json').read_text());sql=(R/'database/001_schema.sql').read_text();screens=json.loads((R/'design/screens.json').read_text());report=json.loads((R/'checks/report.json').read_text())
ops=[(m,p,o) for p,methods in api['paths'].items() for m,o in methods.items()]
CSS='''*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f4f6f0;color:#203e34;font:16px/1.85 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}main{max-width:1180px;margin:auto;padding:45px 30px 100px}h1{font-size:36px;line-height:1.3;margin:15px 0 25px}h2{font-size:25px;margin:0 0 18px}h3{font-size:18px}a{color:#23634c}section{background:white;border:1px solid #e0e6db;border-radius:19px;padding:26px;margin:22px 0}p{overflow-wrap:anywhere}small,.muted{color:#647568}.eyebrow{font-size:12px;letter-spacing:2px;color:#57795b}nav{display:flex;flex-wrap:wrap;gap:16px;margin:20px 0}table{width:100%;border-collapse:collapse;font-size:14px}th,td{border:1px solid #dce4d7;text-align:left;padding:12px;vertical-align:top;overflow-wrap:anywhere}th{background:#eaf1e5}pre{overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f5ee;border-radius:12px;padding:18px;font:13px/1.65 ui-monospace,monospace}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}.grid section{margin:0}.button{display:inline-block;padding:11px 17px;background:#255d48;color:white;border-radius:12px;text-decoration:none;margin:5px 5px 5px 0}.notice{border-left:4px solid #b7873c;background:#fff7e8;padding:16px 20px;margin:20px 0}.screen-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:22px}.screen-grid img{display:block;width:100%;height:auto;border-radius:22px;box-shadow:0 10px 25px #203e3415}.screen-grid h3{font-size:16px;margin:8px 0}.screen-grid p{font-size:12px;color:#67796e}.pill{font-size:12px;background:#e4eedc;padding:4px 8px;border-radius:6px}details{border:1px solid #e0e6db;border-radius:10px;padding:12px;margin:10px 0}summary{cursor:pointer;font-weight:600}input{width:100%;padding:14px;border:1px solid #d1dcc9;border-radius:10px;font:inherit}.flow{display:flex;gap:10px;flex-wrap:wrap}.flow span{background:#e8f1e4;padding:12px;border-radius:9px}@media print{body{background:white}main{max-width:none;padding:0}section{break-inside:avoid;border-color:#ccc}nav,.noprint{display:none}h1{font-size:26px}h2{font-size:20px}a{color:inherit}pre{font-size:10px}.screen-grid{grid-template-columns:repeat(3,1fr)}}'''
def nav(prefix='..'):return '<nav>'+''.join(f'<a href="{prefix}/{path}">{label}</a>' for path,label in [('index.html','交付总览'),('requirements/index.html','需求文档'),('design/index.html','页面设计'),('technical/index.html','技术方案'),('database/index.html','数据库'),('api/index.html','接口契约'),('checks/index.html','验证报告')])+'</nav>'
def doc(title,body,path):
 path.parent.mkdir(exist_ok=True,parents=True);prefix='.' if path.parent==R else '..'
 path.write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+E(title)+' · 词伴0.1</title><style>'+CSS+'</style><main><div class="eyebrow">WORDMATE / 词伴 · 0.1 · 2026-10-20</div><h1>'+E(title)+'</h1>'+nav(prefix)+body+'<p class="muted">本地设计交付。无远程脚本、字体或数据上传；可以用浏览器打印为PDF。全部功能统一属于0.1。</p></main></html>')
def section(title,body,id=''):return '<section'+(' id="'+id+'"' if id else '')+'><h2>'+E(title)+'</h2>'+body+'</section>'
def paras(text):return ''.join('<p>'+E(p)+'</p>' for p in text.split('\n'))
def table(headers,rows):return '<table><thead><tr>'+''.join('<th>'+E(x)+'</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+str(x)+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table>'
# 总览与覆盖矩阵
body='<p>一套可供产品、设计、前后端共同评审的完整方案：家庭共学、系列例句、英美发音、单词管理、记忆复习、月测与错题日历、打卡分享。</p><div class="grid">'
for title,desc,url in [('需求文档','15项需求映射；完整功能规则与验收标准。','requirements/index.html'),('页面设计','46张页面与状态图；SVG/PNG和离线可点击原型。','design/index.html'),('技术方案','技术栈、模块、AI接入、权限、并发、部署与留存。','technical/index.html'),('数据库','29张表的完整初始迁移及约束说明。','database/index.html'),('接口契约','85个操作、58个数据模型，覆盖全部需求。','api/index.html'),('验证报告','真实执行SQL及Schema校验，明确验证边界。','checks/index.html')]:body+=section(title,'<p>'+desc+'</p><a class="button" href="'+url+'">打开</a>')
body+='</div><p><a class="button" href="design/prototype.html">体验离线原型</a><a class="button" href="design/overview.svg">打开设计总览图</a></p>'
body+='<div class="notice">已补齐账号解散、持久删除任务和例句权限的评审问题；工程版本固定与供应商接入需按开工清单验证。本包不包含已部署的后端或真实微信小程序；原型使用演示数据。供应商账号、词典授权和上线配置仍需实施时提供。</div>'
body+=section('已确定的实现方案',paras('前端：Taro + React + TypeScript + SCSS。后端：NestJS + TypeORM + PostgreSQL。任务：Redis + BullMQ，PostgreSQL持久任务表保证可恢复。记忆调度：ts-fsrs。文本生成：开发用OpenAI，可配置切换千问；英美语音：阿里云CosyVoice适配器；私有文件：阿里云OSS。\n默认月测范围为所选月学过的义项，抽样10/20/30/50或全量；优秀≥90、良好≥80、合格≥60、待加强<60。孩子的每月试卷和每次错误都保留独立事实。'))
body+=section('需求到交付的覆盖',table(['需求','内容','页面','接口与数据库'],[(f[0],E(f[1]),E(f[5]),E(f[4])+'<br><small>'+E(f[3])+'</small>') for f in FEATURES]),'coverage')
doc('词伴 0.1 · 完整设计交付包',body,R/'index.html')
# PRD统一替换旧增补页，不再留互相矛盾的SQL待补齐说明。
body='<p>文档状态：完整草案，供最终评审。下列默认值已经同步到技术方案、SQL与OpenAPI，调整时必须一并修改。</p>'
body+=section('核心路径','<div class="flow">'+''.join('<span>'+x+'</span>' for x in ['微信登录 → 家庭审批','选择孩子 → 录词确认','关联例句 → 间隔复习','日历错词 → 再练','月测 → 四档成绩 → 自动归错'])+'</div>')
for i,(title,text) in enumerate(PRD):body+=section(title,paras(text),'monthly-quiz' if title=='按月复习测验' else 'r'+str(i))
body+=section('F01–F15验收矩阵',table(['编号 / 需求','功能规则','验收要点'],[(f[0]+' '+E(f[1]),E(f[2]),E(f[6])) for f in FEATURES]))
body+=section('完整交互状态表',table(['场景','展示','恢复方式'],[(E(a),E(b),E(c)) for a,b,c in [('无家庭/孩子/词','引导创建或申请，月测不可开始','按身份显示创建按钮'),('词典失败','保留输入，标明未确认条目','retry批次或跳过'),('AI部分失败','词已保存，显示未覆盖义项','只重试缺失部分'),('音频失败','当前口音与文本保留','重试，不能自动换口音'),('409版本冲突','家人已更新，展示最新版本','用户重新确认提交'),('断网','未同步，当前输入保留','同事件ID重试，成功后推进'),('租约过期/接管','当前页只读','重新取得或显式接管'),('空错题日','当天没有错误记录','切换日期'),('测验准备失败','不得出现缺题试卷','重试或放弃'),('未答交卷','展示未答数及计错规则','继续补答或确认交卷'),('满分月测','本次没有错题','返回日历或重测'),('导出过期','文件已过期','重新生成'),('账号失去家庭权限','退出该家庭视图','清除私有缓存，重新选择家庭')]]))
doc('产品需求文档 PRD',body,R/'requirements/index.html')
# 技术架构
body='<p>选择统一TypeScript栈降低前后端沟通成本；数据库承担事实、一致性和隔离，外部AI只生成候选内容。</p><img src="architecture.svg" alt="小程序、API、数据库、Worker及外部服务架构" style="width:100%">'
stack=[('小程序','Taro + React + TypeScript','小程序页面、类型契约及平台适配'),('界面','SCSS + 自定义组件','遵循46张图与设计token'),('后端','NestJS + TypeORM','模块化单体、显式事务、服务端权限'),('数据','PostgreSQL 16基线','复合外键、唯一索引、JSONB及事务'),('任务/缓存','Redis + BullMQ + PG outbox','外部AI任务可恢复、限流'),('算法','ts-fsrs','四级反馈，冻结库和参数版本'),('文本AI','OpenAI / 千问适配器','结构化生成例句/题目，双层验证'),('语音','阿里云CosyVoice北京适配器','英美音色白名单，账号验证后启用'),('词典','授权词典Provider','来源、义项、音标明确，待账号/授权接入'),('对象存储','阿里云OSS私有桶','音频与导出，鉴权读取'),('部署','Docker + HTTPS反向代理','API/Worker分进程、环境隔离')]
body+=section('技术栈选型',table(['层级','技术','用途'],[[E(x) for x in row] for row in stack]))
for i,(title,text) in enumerate(TECH):body+=section(title,paras(text),'t'+str(i))
body+=section('权限矩阵',table(['操作','家庭管理员','普通家长','待审批 / 外部用户'],[[E(x) for x in row] for row in PERMISSIONS]),'permissions')
body+=section('官方资料与核查来源','<p>以下仅用于技术能力与实现参考，产品业务规则由本方案定义。供应商模型/音色及地域可用性必须以部署账号实际目录为准。</p><ul>'+''.join('<li><a href="'+url+'">'+E(title)+'</a></li>' for title,url in [('阿里云小程序部署与域名要求','https://help.aliyun.com/zh/ecs/user-guide/develop-your-wechat-mini-program-in-10-minutes'),('阿里云备案场景说明','https://help.aliyun.com/zh/icp-filing/basic-icp-service/support/faq-about-icp-filing-preparations'),('OpenAI结构化输出','https://developers.openai.com/api/docs/guides/structured-outputs'),('Taro React开发规范','https://docs.taro.zone/docs/react-overall'),('NestJS BullMQ集成','https://docs.nestjs.com/techniques/queues'),('ts-fsrs项目及使用文档','https://github.com/open-spaced-repetition/ts-fsrs'),('千问结构化输出','https://help.aliyun.com/en/model-studio/qwen-structured-output'),('CosyVoice英美音色目录','https://help.aliyun.com/en/model-studio/cosyvoice-voice-list'),('CosyVoice北京HTTP接口','https://help.aliyun.com/zh/model-studio/cosyvoice-tts-http-api'),('PostgreSQL约束','https://www.postgresql.org/docs/16/ddl-constraints.html'),('微信登录流程（实施时按官方配置复核）','https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html'),('OpenAPI 3.1.1规范','https://spec.openapis.org/oas/v3.1.1.html')])+'</ul>')
doc('技术架构与权限设计',body,R/'technical/index.html')
# SQL字典和索引，全部从实际可执行文件生成。
tables=re.findall(r'CREATE TABLE (\w+) \((.*?)\n\);',sql,re.S);comments=dict(re.findall(r"COMMENT ON TABLE (\w+) IS '([^']*)';",sql))
body='<p>29张表完整初始DDL，已在内嵌PostgreSQL执行验证。只用于空库，不连接或修改任何生产数据库。</p><a class="button" href="001_schema.sql">下载完整 SQL</a><a class="button" href="er.mmd">ER图 Mermaid源文件</a>'
body+=section('关系总览', '<pre>users ─ family_members ─ families ─ children\nchildren ─ wordbooks ─ wordbook_words ─ child_words\nchildren ─ batches ─ batch_items ─ child_words\nchild_words ─ sentences / sentence_targets ─ audio_assets\nchild_words ─ word_annotations / word_corrections\nchild_words ─ review_cards ─ review_logs ─ mistake_events\nchildren ─ study_sessions ─ study_session_items ─ review_cards\nchildren ─ daily_word_activity / daily_activity\nchildren ─ monthly_quizzes ─ monthly_quiz_items ─ mistake_events\nchildren ─ generation_jobs；family ─ audit_logs；users ─ lifecycle_jobs（目标UUID无外键）</pre>')
body+=section('数据一致性与事务边界',paras('身份以family_members有效关系授权，复合外键只防跨孩子关联，不代替鉴权。所有业务写锁顺序为家庭→孩子→测验→会话→队列项/题目→卡片（无该实体时跳过）。\nreview_logs与mistake_events是追加事实；SQL不提供通用UPDATE接口。应用账户通过服务层控制不可变历史；SQL未使用触发器实现所有状态机。月测候选数组去重、选项属于题目、词义正确、题量齐全、daily_word与card真实义项一致，必须在应用事务校验。\n每日按义项去重，不按题型卡重复计数。原子交卷必须写成绩和错误事实；例句/音频任务入队与词保存同事务，PG任务表是可恢复事实。所有这些事务已在技术方案详述。'))
body+=section('表目录',table(['表','含义'],[(f'<a href="#{name}">{name}</a>',E(comments.get(name,''))) for name,_ in tables]))
for name,definition in tables:body+=section(name,paras(comments.get(name,''))+'<pre>'+E('CREATE TABLE '+name+' (\n'+definition.strip()+'\n);')+'</pre>',name)
extras='\n'.join(x.strip()+';' for x in sql.split(';') if re.search(r'\b(ALTER TABLE|CREATE (?:UNIQUE )?INDEX)\b',x))
body+=section('补充外键、约束及索引','<pre>'+E(extras)+'</pre>')
body+=section('迁移与删除','<pre>psql "$WORDMATE_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/001_schema.sql</pre>'+paras('实施时由TypeORM migration包装此初始SQL，禁止synchronize自动改表。已有数据库必须编写差异迁移和备份演练，不能重跑本文件。删除孩子必须按外键依赖顺序清理，详见技术方案；所有任务写回都应重查孩子与任务状态。'))
doc('数据库结构与事务设计',body,R/'database/index.html')
# OpenAPI文档由JSON生成，避免人工接口列表失配。
body=f'<p>{len(ops)}个接口操作，{len(api["components"]["schemas"])}个Schema；OpenAPI版本3.1.1，产品版本0.1。API域名为占位，尚未部署。</p><a class="button" href="openapi.json">OpenAPI JSON</a><a class="button" href="examples.json">请求样例</a>'
body+=section('统一协议',paras('Authorization: Bearer；时间ISO8601 UTC，日期YYYY-MM-DD，月份YYYY-MM；UUID资源标识。跨家庭404，角色不足403；业务资源读写检查有效成员；删除任务仅按发起者本人鉴权，目标删除后仍可查询。\n列表默认limit20，上限100，不透明cursor绑定筛选。写请求带Idempotency-Key，登录/只读POST例外；event_id持久去重。版本冲突409，过期资源410，业务校验422，限流429。\n日志与月测结果响应用安全DTO；错误响应含request_id/code/message/retryable，可含details。查任务不得透传payload和未交卷题目答案。完整规则见每个operation的description。'))
body+='<input class="noprint" id="filter" placeholder="搜索接口用途、路径或权限"><div id="operations">'
for m,path,o in ops:
 spec={k:v for k,v in o.items() if k not in ['operationId','summary','tags']}
 body+='<details class="operation"><summary><span class="pill">'+m.upper()+'</span> '+E(path)+' · '+E(o['summary'])+'</summary><p>'+E(o['description']).replace('\n','<br>')+'</p><pre>'+E(json.dumps(spec,ensure_ascii=False,indent=2))+'</pre></details>'
body+='</div><h2>数据模型</h2>'
for n,schema in api['components']['schemas'].items():body+='<details id="'+n+'"><summary>'+E(n)+'</summary><pre>'+E(json.dumps(schema,ensure_ascii=False,indent=2))+'</pre></details>'
body+='<script>document.getElementById("filter").addEventListener("input",e=>{const q=e.target.value.toLowerCase();document.querySelectorAll(".operation").forEach(x=>x.style.display=x.textContent.toLowerCase().includes(q)?"":"none")})</script>'
doc('完整 API 接口契约',body,R/'api/index.html')
# 新设计替换旧Figma材料作为入口。
body='<p>46张390×844页面与状态图，覆盖全部0.1功能。SVG可编辑、PNG可直接预览；交互原型离线运行，不调用账号或外部服务。</p><a class="button" href="prototype.html">打开可点击原型</a><a class="button" href="overview.svg">全页面矢量总览</a><a class="button" href="screens.json">页面设计数据</a>'
body+=section('设计规范',table(['项目','规则'],[(E(a),E(b)) for a,b in [('基准','390×844；实际小程序适配宽度、安全区，内容可滚动'),('颜色','#255D48主色；#203E34正文；#F7F8F2背景；#E8F1E4辅助；警告使用文字配合琥珀色'),('字号','单词/成绩25–40；标题26；正文14–16；辅助12；真实实现跟随系统可读性设置'),('间距','左右24，区块12–18，卡片16，按钮高48–52'),('组件','WordRow、AudioPicker、WordLookupSheet、CalendarGrid、AnnotationChips、QuizOption、LeaseNotice、AsyncStatus'),('状态','disabled/loading/empty/error/conflict/offline全部明确；点击区至少44×44'),('导航','今日/单词本/日历/我的四Tab；子页可返回，复习与月测退出需保留草稿或确认'),('原型边界','内置10个演示词，可录词/点词/标注/答题计分；无真实微信、AI、跨端同步或后端权限逻辑')]]))
body+='<div class="screen-grid">'
for i,s in enumerate(screens):
 file=f'screens/{i+1:02}-{s["id"]}'
 body+=f'<div id="{s["id"]}"><h3>{i+1:02} {E(s["title"])}</h3><a href="prototype.html#{s["id"]}"><img loading="lazy" src="{file}.svg" alt="{E(s["title"])}"></a><p><a href="{file}.svg">SVG</a> · <a href="{file}.png">PNG</a> · <a href="prototype.html#{s["id"]}">交互</a></p></div>'
body+='</div>'
doc('页面设计与交互原型',body,R/'design/index.html')
# 验证报告：明确实际检查而非业务完成。
body='<p>以下为本地实际执行结果；不是服务端端到端或真机验收报告。</p>'
for k,title in [('database','数据库结构与约束'),('api','接口Schema与样例')]:body+=section(title,'<ul>'+''.join('<li>'+E(x)+'</li>' for x in report[k])+'</ul>')
body+=section('设计检查',paras('46个SVG均可解析；已渲染所有PNG并抽查月测配置、作答、成绩、词条和日历的排版。交互脚本通过Node语法检查。原型页面导航及本地资源链接由交付检查脚本核对。未声称微信真机、全量浏览器或无障碍测试已通过。'))
prototype_report=json.loads((R/'checks/prototype-report.json').read_text())
body+=section('离线原型逻辑验证','<ul>'+''.join('<li>'+E(x)+'</li>' for x in prototype_report['checks'])+'</ul>'+paras(prototype_report['limitations'][0]))
body+=section('验证边界','<ul>'+''.join('<li>'+E(x)+'</li>' for x in report['limitations'])+'</ul>'+paras('授权Guard、业务状态机、队列崩溃恢复、供应商实际质量和多连接竞态需要实现后测试。本包约束不替代应用层状态机。文档对这些规则已有明确设计与验收项。'))
body+=section('复现','<pre>node checks/validate.cjs\nnode checks/prototype.cjs\npython3 build.py\nnode --check design/prototype.js\npython3 tools/check_delivery.py</pre><p>SQL检查使用本机已有PGlite和Ajv；其他机器可设置WORDMATE_CHECK_DEPS指向包含pglite-2及ajv的node_modules。详见脚本，不会连接生产库。</p>')
doc('验证与验收报告',body,R/'checks/index.html')
print('Generated complete PRD, technical, database, API, design and checks documents.')
