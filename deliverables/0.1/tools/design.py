from pathlib import Path
import json,html,textwrap,re
R=Path(__file__).resolve().parents[1];D=R/'design';(D/'screens').mkdir(exist_ok=True)
# 所有示例为虚构孩子和演示数据；内容驱动SVG和可点击原型。
S=[]
def screen(id,title,sub,cards,primary,to,tab='今日',secondary=None):
 S.append(dict(id=id,title=title,sub=sub,cards=cards,primary=primary,to=to,tab=tab,secondary=secondary or []))
def card(title,body='',kind='plain',to=None):return dict(title=title,body=body,kind=kind,to=to)
screen('welcome','一起，把单词记久一点','WORDMATE / 词伴 · 家庭共学',[card('每个孩子，一份进度','爸爸妈妈各自登录，一起陪伴。','hero'),card('你的单词，你的节奏','录入生活里的词，在句子中理解。'),card('每天一点，长期记住','复习、月测和错词回顾，都在这里。')],'微信登录','family')
screen('home','晚上好，小明','小明的学习空间  ▾',[card('6 / 10','今日学习目标 · 再学4词就完成','hero'),card('今天该复习 8 词','到期优先；还可以学4个新词','tint','review'),card('连续学习 5 天','一 ✓　 二 ✓　 三 ✓　 四 ✓　 五 ●'),card('家人的陪伴','妈妈 19:20 陪练6词 · 爸爸添加了旅行词')],'开始陪孩子复习','review',secondary=[['切换孩子','children'],['本月测验','quiz_setup']])
screen('words','装进自己的单词','旅行小词本 · 24个义项',[card('⌕ 搜索英文 / 中文','全部　收藏　易错　简单　待纠错','search','search'),card('luggage　行李','易错 · 收藏 · 历史错3次','tint','word'),card('airport　机场','简单 · 今天待复习','plain','word'),card('delay　延迟','待纠错 · 已保存释义','plain','correction')],'＋ 添加 / 批量添加','add','单词本', [['导出单词','export'],['分享清单','share_words']])
screen('add','今天想学什么？','单个输入 / 批量粘贴 · 每批最多30项',[card('单词或短语','airport\nluggage\ndelay','input'),card('关联例句主题','旅行 ✓　校园　日常','tint'),card('发音偏好','美音 ✓　英音　·　女声A　·　正常语速','plain','settings')],'解析并确认词义','confirm','单词本')
screen('confirm','选对意思，再开始','识别3项 · 重复项沿用已有学习进度',[card('airport','✓ 名词 · 机场','tint'),card('luggage','✓ 名词 · 行李（不可数）'),card('delay','● 名词 · 延迟\n○ 动词 · 推迟'),card('单词先保存，例句随后生成','如个别条目无结果，可修改后重试。')],'保存并生成关联例句','word','单词本')
screen('word','luggage','/ˈlʌɡɪdʒ/　n. 行李',[card('▶ 美音 · 女声A','切换：英音 / 美音　 正常 / 慢速','tint','settings'),card('在句子里理解','Our luggage arrived at the airport after a short delay.','sentence','lookup'),card('词条标注','简单　易错 ✓　收藏 ☆　待纠错','plain','annotations'),card('历史错误 3 次','最近一次：10月16日 · 月测','plain','wrong')],'复习这个词','review','单词本',[['换一句','generating'],['提交纠错','correction']])
screen('annotations','给单词做个标记','luggage · 标注由爸爸妈妈共享',[card('简单词','目前觉得容易回忆；不跳过复习。'),card('易错词 ✓','想多留意的词；与简单词互斥。','tint'),card('收藏 ☆','留作重点回看，可与其他标注并存。'),card('待纠错','词条或例句可能需要修正。')],'保存标注','word','单词本')
screen('search','查一个词','查我的单词本 / 查词典',[card('⌕ luggage','支持英文或中文查询','search'),card('我的单词本 · 1条','luggage　n. 行李','tint','word'),card('词典结果','查到词形与多种词义，选择后添加。','plain','lookup')],'查看词典释义','lookup','单词本')
screen('lookup','在句子中查词','点词弹层 · 可选择相邻词查询短语',[card('原句','Our luggage arrived at the airport after a short delay.','sentence'),card('luggage','n. 行李（不可数）\n▶ 英音　▶ 美音','hero'),card('已有义项','已在旅行小词本 · 收藏 ☆','tint'),card('词义选择','词典来源及音标展示；上下文建议仅供参考。')],'收起，继续阅读','word','单词本',[['添加其他义项','confirm']])
screen('review','先想一想，它是什么意思？','小明 · 妈妈陪学 · 第3 / 8词',[card('luggage','▶ 听发音','hero'),card('回忆以后，再揭晓','这次先不展示释义和例句。'),card('学习进度已同步','断网时会保留当前反馈，不提前计打卡。')],'揭晓答案','review_answer')
screen('review_answer','这次回忆得怎么样？','luggage · n. 行李',[card('Our luggage arrived at the airport.','我们的行李到达了机场。','sentence','lookup'),card('请按真实回忆情况选择','忘记 / 困难 / 记得 / 轻松'),card('忘记会加入错题集','困难不算答错；每次反馈会保存。','tint')],'记得 · 正常想起来了','checkin','今日',[['忘记','wrong'],['困难','checkin'],['轻松','checkin']])
screen('checkin','今天的陪伴，完成啦','小明 · 今日已打卡',[card('10 / 10','完成今日目标 · 连续学习5天','hero'),card('记住的，会慢慢变多','爸爸妈妈的接力，共享一份进度。','tint'),card('下一次见','下次复习时间由记忆状态安排。')],'分享打卡海报','share','今日',[['返回今日','home'],['查看日历','calendar']])
screen('calendar','每一天，都有迹可循','2026年10月　‹　›',[card('学习日历','calendar','calendar'),card('10月16日 · 已打卡','学习10词 · 错词2个 / 错误3次','tint','wrong'),card('本月复习测验','抽样或全量，看看记住了多少。','plain','quiz_setup')],'复习这天错词','wrong','日历',[['测验记录','quiz_history']])
screen('wrong','错过的，再见一面','10月16日 · 全部来源 ▾',[card('luggage　行李','错2次 · 月测 / 复习','tint','word'),card('delay　延迟','未作答1次 · 月测','plain','word'),card('记录一直保留','以后练对不会删除历史，方便回看。')],'复习这些错词','review','日历',[['导出错词','export']])
screen('quiz_setup','看看这个月记住了多少','2026年10月 ▾ · 学习过24个义项',[card('抽样测试 ●','随机抽取，不重复出题','tint'),card('题量：10　20 ✓　30　50','少于选择数量时测试全部可用词。'),card('全量测试 ○','覆盖全部24词，可中途退出续答。'),card('四档成绩','优秀 ≥90%　良好 ≥80%\n合格 ≥60%　待加强 <60%')],'开始月测','quiz_preparing','日历',[['历史成绩','quiz_history']])
screen('quiz_preparing','正在准备题目','本次题目和顺序将在开始后固定',[card('准备中 · 12 / 20','正在检查选项与词义，稍等一下。','hero'),card('生成失败也不会丢失词库','可重试或放弃；不生成不完整试卷。')],'预览准备完成状态','quiz','日历',[['返回日历','calendar']])
screen('quiz','选择最符合词义的答案','10月月测 · 第1 / 20题 · 已保存',[card('luggage（名词）','在旅行中携带的 luggage','hero'),card('A　行李','选择答案','option'),card('B　机场','选择答案','option'),card('C　航班','选择答案','option'),card('D　座位','选择答案','option')],'下一题','quiz_submit','日历',[['答题卡 / 交卷','quiz_submit'],['暂存退出','quiz_history']])
screen('quiz_submit','准备好交卷了吗？','交卷后不能修改答案',[card('已答18 / 20题','还有2题未作答，将按错误计分。','hero'),card('回到答题卡检查','可以继续补答或修改已有答案。','plain','quiz'),card('交卷后自动整理错题','答错和未答都会进入错题集。')],'确认交卷','quiz_score','日历',[['继续作答','quiz']])
screen('quiz_score','良好 · 再巩固一点','2026年10月 · 抽样测试',[card('85.0 分','答对17 / 20 · 覆盖24词中的20词','hero'),card('错题3个已自动归集','包括未答2题 · 可直接开始复习','tint','wrong'),card('抽样成绩仅反映本次样本','再次测验保留新的独立成绩。')],'复习本次错题','wrong','日历',[['查看试卷解析','quiz_results'],['返回日历','calendar']])
screen('quiz_results','回看每一道题','交卷后显示正确答案和解析',[card('luggage　✓ 正确','你的答案：行李\n正确答案：行李','tint'),card('delay　未作答','正确答案：延迟\n已加入错题集'),card('boarding　回答错误','正确答案：登机\n你的答案：行李')],'复习本次错题','wrong','日历')
screen('quiz_history','每一次，都有记录','2026年10月 ▾',[card('10月16日 · 抽样20题','85.0分 · 良好 · 已完成','tint','quiz_score'),card('10月12日 · 全量24题','75.0分 · 合格 · 已完成','plain','quiz_score'),card('未完成测验可继续','再次测验不覆盖原来的成绩。')],'开始新的月测','quiz_setup','日历')
screen('share','把今天的坚持留下来','分享预览 · 默认隐藏昵称',[card('今日学习 10 词','连续5天 · 今天也在慢慢进步','hero'),card('显示孩子昵称：关闭','预览不含家长身份、错题或家庭邀请。'),card('由你决定分享给谁','保存图片后可自行分享；分享不开放学习档案。')],'保存海报（演示）','checkin','今日')
screen('share_words','分享选定的单词','清单预览 · 最多20个义项',[card('旅行小词单','airport　机场\nluggage　行李\ndelay　延迟','hero'),card('只分享你选中的内容','不含孩子姓名、错题和家庭成员信息。')],'保存清单图（演示）','words','单词本')
screen('export','把单词带走','当前筛选：易错词 · 3个义项',[card('导出范围','当前单词本 / 勾选词 / 收藏 / 易错 / 日期错词'),card('文件格式','CSV ✓　JSON\n包含例句：关闭','tint'),card('生成后24小时内下载','下载时仍需家庭权限；完整档案导出仅管理员。')],'生成导出文件','export_done','单词本')
screen('export_done','文件已准备好','单词清单 · CSV · 3条',[card('wordmate-words.csv','24小时内有效','hero'),card('下载需要登录','退出家庭后不可再获取该文件。')],'下载文件（演示）','words','单词本')
screen('correction','让词条更准确','luggage · 词义版本2',[card('问题类型','释义 ✓　音标　例句　拼写　其他'),card('当前内容','n. 行李'),card('建议修正','补充：行李通常作不可数名词。','input'),card('提交后由家庭管理员处理','词义身份改变时重新添加，不转移旧历史。')],'提交纠错建议','correction_list','单词本')
screen('correction_list','一起把词条整理好','管理员 · 待处理1项',[card('luggage · 释义纠错','妈妈提交 · 当前版本2','tint','correction'),card('建议内容','行李（不可数名词）'),card('处理前再次核对原内容','若家人已修改，会提示版本冲突。')],'采纳并保存（演示）','word','我的',[['驳回并说明','word']])
screen('family','两个人陪，一个进度','我的 / 小明一家',[card('爸爸 · 管理员','邀请、审批、移除成员和管理孩子','tint','approval'),card('妈妈 · 共同家长','录词、陪学、查看进度和月测'),card('孩子档案','小明 · A2　　小雨 · A1','plain','children')],'邀请另一位家长','invite','我的',[['学习设置','settings'],['处理纠错','correction_list']])
screen('invite','一起陪孩子学单词','家庭邀请 · 24小时有效',[card('一次邀请，一位家长','对方微信登录申请后，由管理员确认。','hero'),card('邀请不等于立即加入','审批前不会开放孩子的词库与学习记录。')],'由家长主动分享邀请','approval','我的')
screen('approval','确认加入家庭的人','管理员待审批',[card('妈妈申请加入','称呼只是展示，核对后再批准。','tint'),card('批准后共享孩子学习数据','可以录词、复习、月测和下载单词清单。')],'批准加入（演示）','family','我的',[['拒绝申请','family']])
screen('children','每个孩子，一份成长','切换学习空间',[card('小明 ✓','A2 · 美音 · 每日10词','tint','home'),card('小雨','A1 · 英音 · 每日5词','plain','home'),card('添加孩子（管理员）','昵称即可，不需要真实姓名或生日。')],'进入小明的学习空间','home','我的')
screen('settings','找到舒服的学习节奏','小明的设置 · 家庭共享',[card('口音与音色','美音 ✓　英音　·　女声A ▾\n▶ 试听当前音色','tint'),card('语速与难度','正常1.0x　·　英语水平A2'),card('每日计划','目标10词 · 最多10个新词\n今天已开始学习，目标调整明日生效。'),card('账号与家庭','退出登录 / 退出家庭 / 注销\n删除孩子与完整数据导出仅管理员。')],'保存设置','home','我的')
screen('takeover','爸爸正在陪孩子学习','同一孩子同时只有一位答题操作者',[card('已保存的进度会保留','接管后爸爸的旧页面不能继续提交。','hero'),card('其他家长仍可查看进度','不需要共用微信账号或密码。')],'确认由我接着陪学','review','今日',[['只查看进度','home']])
screen('generating','单词已保存','例句正在生成，不影响稍后复习',[card('把词放进同一个场景','airport · luggage · delay','hero'),card('生成中 / 部分失败','已生成内容保留，只重试未完成的部分。')],'预览生成成功','word','单词本')
screen('empty','从今天遇到的词开始','这个孩子还没有学习记录',[card('先录入几个单词吧','确认词义后，就能开始复习。','hero'),card('月测需要已有学习记录','没有可测单词时不会生成空试卷。')],'添加第一批单词','add','单词本')
screen('error','还没同步成功','网络断开 · 当前输入已保留',[card('请连接网络后重试','保存成功之前，不推进进度或打卡。','hero'),card('家人修改了内容？','出现版本冲突时，先刷新再确认，不覆盖对方修改。')],'重试（演示）','home','今日')
screen('family_create','给家人一个学习空间','微信登录成功 · 尚未加入家庭',[card('家庭名称','小明一家','input'),card('你将成为家庭管理员','可以邀请家人和添加孩子。')],'创建家庭','child_create','我的',[['我收到邀请','join']])
screen('child_create','先认识一下小小学习者','添加孩子 · 管理员',[card('孩子昵称','小明','input'),card('起始水平','A1　A2 ✓　B1　B2'),card('每日目标','10个词 · 新词上限10个'),card('发音偏好','美音 ✓　英音')],'保存孩子档案','empty','我的')
screen('join','一起陪孩子学单词','你收到一份家庭邀请',[card('爸爸邀请你加入家庭','加入后可一起管理词库与陪学。','hero'),card('加入需要管理员确认','审批前不显示孩子学习记录。')],'微信登录并申请加入','pending','我的')
screen('pending','申请已提交','等待家庭管理员确认',[card('稍等一下，就能一起陪学','目前尚未获得孩子资料访问权限。','hero'),card('邀请失效怎么办？','请管理员重新生成邀请。')],'查看批准后的状态（演示）','family','我的')
screen('account','管理自己的账号','爸爸 · 当前家庭管理员',[card('退出登录','仅退出当前设备，不删除记录。'),card('转交管理员 / 退出家庭','退出前先将管理员交给有效成员。'),card('完整孩子数据导出','仅管理员 · JSON · 24小时有效','plain','export'),card('注销自己的账号','先转交或解散自己管理的家庭。','plain','delete_account')],'返回我的家庭','family','我的')
screen('delete_child','确认删除孩子档案','管理员专属操作',[card('将删除小明的学习档案','单词、复习、月测和音频都会清理。','hero'),card('输入昵称确认','小明','input'),card('删除在后台执行','先停止陪学和生成任务，处理中不可继续学习。')],'确认删除（演示，不执行）','deletion_progress','我的',[['取消','children']])
screen('dissolve_family','确认解散这个家庭','仅剩自己一位有效成员时可操作',[card('家庭数据将被删除','所有孩子的词库、学习记录和音频都会删除。','hero'),card('删除前可先导出','如需保留，请返回账号页完成下载。'),card('输入家庭名称','小明一家','input'),card('确认删除全部家庭数据','有其他家长时，先转交或明确移除；不自动移除。')],'确认解散（演示）','deletion_progress','我的',[['返回账号','account']])
screen('deletion_progress','正在清理数据','后台处理 · 目标已停止学习',[card('正在删除文件','随后清理学习记录，离开页面也会继续。','hero'),card('失败时可重试','沿用同一任务继续，不恢复学习状态。'),card('任务结果独立保存','档案删除后，仍可查看结果。')],'预览删除完成','deletion_done','我的',[['演示失败后重试','deletion_progress'],['返回账号','account']])
screen('deletion_done','数据已清理完成','删除任务 · 已完成',[card('该目标的学习数据已删除','其他家庭不受影响。','hero'),card('接下来可以管理账号','若已没有管理员职责和进行中的删除任务，可注销。')],'返回账号','account','我的',[['注销自己的账号','delete_account']])
screen('delete_account','注销自己的账号','需要确认 · 不可撤销',[card('先处理管理员职责','有其他家长可转交；只有自己可解散家庭。','plain','dissolve_family'),card('等待删除任务完成','未完成时保留登录，方便查询和重试。','plain','deletion_progress'),card('确认注销自己的账号','完成后撤销登录；其他家庭学习历史仍保留。')],'确认注销（演示）','welcome','我的',[['返回账号','account']])
# 主路径串联创建、加入和账号流程。
for s in S:
 if s['id']=='account':s['secondary']=[['解散家庭','dissolve_family'],['删除孩子','delete_child']]
 if s['id']=='welcome':s['to']='family_create';s['secondary']=[['我收到邀请','join']]
 if s['id']=='family':s['secondary'].append(['账号管理','account'])
 if s['id']=='children':s['cards'][-1]['to']='child_create'
 if s['id']=='settings':s['cards'][-1]['to']='account'
(D/'screens.json').write_text(json.dumps(S,ensure_ascii=False,indent=2))
# 独立SVG设计图，可用浏览器打开或导入支持SVG的设计工具。
def esc(s):return html.escape(str(s))
def lines(s,width=22):
 out=[]
 for row in s.split('\n'):
  current='';w=0
  for token in re.findall(r"[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|\s+|[^A-Za-z0-9\s]",row):
   cw=sum(2 if ord(ch)>255 else 1 for ch in token)
   if w+cw>width*2 and current:
    out.append(current.rstrip());current='';w=0
    if token.isspace():continue
   current+=token;w+=cw
  out.append(current.rstrip())
 return out

svgstyle='<style>text{font-family:"PingFang SC","Noto Sans CJK SC",sans-serif} .small{font-size:12px;fill:#67796e} .body{font-size:14px;fill:#3b5147}</style>'
def svg(s):
 out=[f'<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844"><title>{esc(s["title"])}</title>',svgstyle,'<rect width="390" height="844" rx="30" fill="#f7f8f2"/>','<text x="24" y="30" font-size="12" fill="#203e34">9:41</text><text x="304" y="30" font-size="13" fill="#203e34">•••　◉</text><text x="24" y="73" font-size="15" fill="#255d48">词伴</text>']
 out.append(f'<text x="24" y="111" class="small">{esc(s["sub"][:42])}</text>')
 for i,l in enumerate(lines(s['title'],15)):out.append(f'<text x="24" y="{151+i*31}" font-size="25" font-weight="600" fill="#203e34">{esc(l)}</text>')
 y=177+(len(lines(s['title'],15))-1)*31
 for c in s['cards']:
  if c['kind']=='calendar':
   h=183;out.append(f'<rect x="24" y="{y}" width="342" height="{h}" rx="16" fill="white"/>')
   for j,day in enumerate(['一','二','三','四','五','六','日']):out.append(f'<text x="{46+j*46}" y="{y+20}" text-anchor="middle" font-size="11" fill="#67796e">{day}</text>')
   for n in range(1,32):
    x=46+((n+2)%7)*46;cy=y+48+((n+2)//7)*28
    if n==16:out.append(f'<circle cx="{x}" cy="{cy-4}" r="12" fill="#255d48"/>')
    out.append(f'<text x="{x}" y="{cy}" text-anchor="middle" font-size="12" fill="'+('white' if n==16 else '#203e34')+'">'+str(n)+'</text>')
   y+=h+12;continue
  body=lines(c['body']);h=52+len(body)*21
  if y+h>690:h=min(h,690-y);body=body[:max(0,(h-52)//21)]
  if h<40:continue
  fill='#255d48' if c['kind']=='hero' else '#e8f1e4' if c['kind'] in ['tint','search'] else '#ffffff'
  fg='#ffffff' if c['kind']=='hero' else '#203e34';out.append(f'<rect x="24" y="{y}" width="342" height="{h}" rx="16" fill="{fill}"/>')
  for i,l in enumerate(lines(c['title'],22)[:1]):out.append(f'<text x="40" y="{y+28}" font-size="17" font-weight="600" fill="{fg}">{esc(l)}</text>')
  for i,l in enumerate(body):out.append(f'<text x="40" y="{y+53+i*21}" font-size="13" fill="{fg}" opacity="0.85">{esc(l)}</text>')
  y+=h+12
 out += [f'<rect x="24" y="706" width="342" height="48" rx="13" fill="#255d48"/><text x="195" y="736" text-anchor="middle" font-size="14" fill="white">{esc(s["primary"])}</text>']
 for i,a in enumerate(s['secondary'][:3]):out.append(f'<text x="{75+i*120}" y="780" text-anchor="middle" font-size="12" fill="#527563">{esc(a[0])}</text>')
 out.append('<path d="M24 797H366" stroke="#dae3d8"/>')
 for i,t in enumerate(['今日','单词本','日历','我的']):out.append(f'<text x="{56+i*93}" y="825" text-anchor="middle" font-size="12" fill="'+('#255d48' if t==s['tab'] else '#8b948d')+'">'+t+'</text>')
 out.append('</svg>');return ''.join(out)
for i,s in enumerate(S): (D/'screens'/f'{i+1:02}-{s["id"]}.svg').write_text(svg(s))
# 4列设计总览，纯矢量且不依赖外部资源。
board=['<svg xmlns="http://www.w3.org/2000/svg" width="1776" height="'+str(130+((len(S)+3)//4)*936)+'" viewBox="0 0 1776 '+str(130+((len(S)+3)//4)*936)+'">','<rect width="100%" height="100%" fill="#e9eee6"/>',svgstyle,'<text x="42" y="55" font-size="30" fill="#203e34">词伴 · 0.1 全流程设计</text><text x="42" y="88" font-size="15" fill="#67796e">家庭共学 / 单词管理 / 记忆复习 / 月测与错题 / 分享与权限</text>']
for i,s in enumerate(S):
 x=42+(i%4)*432;y=130+(i//4)*936
 board.append(f'<text x="{x}" y="{y}" font-size="15" fill="#203e34">{i+1:02} {esc(s["title"])}</text><svg x="{x}" y="{y+20}" width="390" height="844" viewBox="0 0 390 844">'+svg(s).split('>',1)[1].rsplit('</svg>',1)[0]+'</svg>')
board.append('</svg>');(D/'overview.svg').write_text(''.join(board))
print('design screens:',len(S))
