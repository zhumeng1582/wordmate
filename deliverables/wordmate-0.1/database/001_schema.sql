-- 词伴 0.1 · PostgreSQL 16+ · 完整初始迁移，仅用于空数据库；禁止对已有库重复执行。
-- 业务权限在服务端执行；不得将数据库账号直接交给小程序。
BEGIN;
CREATE SCHEMA wordmate;
SET search_path TO wordmate, public;

CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 wx_app_id text NOT NULL, wx_open_id text NOT NULL,
 display_name varchar(40) NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleting','deleted')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(wx_app_id, wx_open_id)
);
COMMENT ON TABLE users IS '登录家长；账号注销时清除微信身份，孩子记录不级联删除';

CREATE TABLE auth_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id),
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE auth_sessions IS '自有登录会话，只存访问令牌哈希，不存明文';

CREATE TABLE families (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(40) NOT NULL,
 owner_user_id uuid NOT NULL REFERENCES users(id),
 version integer NOT NULL DEFAULT 1 CHECK(version > 0),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','deleting')),
 created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE families IS '家庭协作范围；owner_user_id 为唯一管理员来源，避免角色字段与所有者双写不一致';
CREATE TABLE family_members (
 family_id uuid NOT NULL REFERENCES families(id),
 user_id uuid NOT NULL REFERENCES users(id),
 display_name varchar(40) NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','left','removed')),
 joined_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 PRIMARY KEY(family_id,user_id)
);
ALTER TABLE families ADD CONSTRAINT family_owner_member_fk
 FOREIGN KEY(id,owner_user_id) REFERENCES family_members(family_id,user_id)
 DEFERRABLE INITIALLY DEFERRED;
COMMENT ON TABLE family_members IS '家庭成员；爸爸妈妈是显示称呼，权限由家庭所有者与有效成员关系决定';

CREATE TABLE family_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 family_id uuid NOT NULL REFERENCES families(id),
 created_by uuid NOT NULL REFERENCES users(id), token_hash text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','claimed','approved','rejected','revoked','expired')),
 claimed_by uuid REFERENCES users(id), approved_by uuid REFERENCES users(id),
 expires_at timestamptz NOT NULL, claimed_at timestamptz, approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(expires_at > created_at),
 CHECK(status NOT IN ('claimed','approved') OR claimed_by IS NOT NULL),
 CHECK(status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
COMMENT ON TABLE family_invites IS '一次性邀请及待审批申请；领取与审批锁定本行，批准需再次校验有效期';

CREATE TABLE children (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), family_id uuid NOT NULL REFERENCES families(id),
 nickname varchar(40) NOT NULL, timezone text NOT NULL DEFAULT 'Asia/Shanghai',
 accent text NOT NULL DEFAULT 'en-US' CHECK(accent IN ('en-US','en-GB')),
 voice_id text, speech_rate numeric(3,2) NOT NULL DEFAULT 1 CHECK(speech_rate BETWEEN 0.5 AND 1.5),
 level text NOT NULL DEFAULT 'A2' CHECK(level IN ('A1','A2','B1','B2','C1','C2')),
 daily_new_limit integer NOT NULL DEFAULT 10 CHECK(daily_new_limit BETWEEN 0 AND 100),
 daily_goal integer NOT NULL DEFAULT 10 CHECK(daily_goal BETWEEN 1 AND 500),
 version integer NOT NULL DEFAULT 1 CHECK(version > 0),
 archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,family_id)
);
COMMENT ON TABLE children IS '实际学习者；口音、目标、时区与进度归孩子，昵称不要求真实姓名';

CREATE TABLE wordbooks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), child_id uuid NOT NULL REFERENCES children(id),
 name varchar(60) NOT NULL, created_by uuid REFERENCES users(id),
 version integer NOT NULL DEFAULT 1 CHECK(version > 0), archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,child_id)
);
COMMENT ON TABLE wordbooks IS '孩子的单词本；跨本复用同一孩子的词与卡';
CREATE TABLE batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), child_id uuid NOT NULL REFERENCES children(id),
 wordbook_id uuid NOT NULL, created_by uuid REFERENCES users(id),
 theme varchar(80), status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','confirmed','archived')),
 version integer NOT NULL DEFAULT 1 CHECK(version > 0),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,child_id),
 FOREIGN KEY(wordbook_id,child_id) REFERENCES wordbooks(id,child_id)
);
COMMENT ON TABLE batches IS '系列单词的明确批次；草稿确认后保存选定义项并创建生成任务';
CREATE TABLE batch_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL, child_id uuid NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 30), raw_text varchar(120) NOT NULL,
 candidates jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(candidates)='array'),
 status text NOT NULL DEFAULT 'needs_confirmation' CHECK(status IN ('needs_confirmation','ready','invalid','duplicate','confirmed')),
 child_word_id uuid,
 FOREIGN KEY(batch_id,child_id) REFERENCES batches(id,child_id), UNIQUE(batch_id,ordinal)
);
COMMENT ON TABLE batch_items IS '保留原始输入、候选词义、错误和重复项，支持逐项确认';
CREATE TABLE child_words (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), child_id uuid NOT NULL REFERENCES children(id),
 lemma varchar(120) NOT NULL, normalized_lemma varchar(120) NOT NULL,
 part_of_speech varchar(24) NOT NULL,
 sense_key text NOT NULL, meaning_zh varchar(500) NOT NULL,
 dictionary_source text NOT NULL, dictionary_entry_id text,
 ipa_gb text, ipa_us text,
 created_by uuid REFERENCES users(id), version integer NOT NULL DEFAULT 1 CHECK(version > 0),
 archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,child_id), UNIQUE(child_id,normalized_lemma,part_of_speech,sense_key)
);
COMMENT ON TABLE child_words IS '已确认的词义；sense_key 必填，源词典义项 ID 或服务端规范化词义哈希';
ALTER TABLE batch_items ADD FOREIGN KEY(child_word_id,child_id) REFERENCES child_words(id,child_id);
CREATE TABLE wordbook_words (
 child_id uuid NOT NULL, wordbook_id uuid NOT NULL, child_word_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(wordbook_id,child_word_id),
 FOREIGN KEY(wordbook_id,child_id) REFERENCES wordbooks(id,child_id),
 FOREIGN KEY(child_word_id,child_id) REFERENCES child_words(id,child_id)
);
COMMENT ON TABLE wordbook_words IS '单词本与义项多对多关系，复合外键防止跨孩子挂接';

CREATE TABLE sentences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), child_id uuid NOT NULL REFERENCES children(id),
 batch_id uuid, text_en text NOT NULL, translation_zh text NOT NULL,
 level text NOT NULL, model text NOT NULL, prompt_version text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validated','rejected','archived')),
 locked boolean NOT NULL DEFAULT false, content_version integer NOT NULL DEFAULT 1 CHECK(content_version > 0),
 created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,child_id),
 FOREIGN KEY(batch_id,child_id) REFERENCES batches(id,child_id)
);
COMMENT ON TABLE sentences IS 'AI 例句；仅 validated 可展示，更新产生新内容版本';
CREATE TABLE sentence_targets (
 child_id uuid NOT NULL, sentence_id uuid NOT NULL, child_word_id uuid NOT NULL,
 surface text NOT NULL, start_utf16 integer NOT NULL CHECK(start_utf16 >= 0),
 end_utf16 integer NOT NULL, PRIMARY KEY(sentence_id,child_word_id,start_utf16),
 CHECK(end_utf16 > start_utf16),
 FOREIGN KEY(sentence_id,child_id) REFERENCES sentences(id,child_id),
 FOREIGN KEY(child_word_id,child_id) REFERENCES child_words(id,child_id)
);
COMMENT ON TABLE sentence_targets IS '目标词及词形映射；位置采用 JS UTF-16 半开区间，由服务端校验';

CREATE TABLE audio_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), child_id uuid NOT NULL REFERENCES children(id),
 child_word_id uuid, sentence_id uuid, content_version integer NOT NULL CHECK(content_version > 0),
 content_hash text NOT NULL, pronunciation_key text NOT NULL DEFAULT '',
 accent text NOT NULL CHECK(accent IN ('en-US','en-GB')), voice_id text NOT NULL,
 speech_rate numeric(3,2) NOT NULL CHECK(speech_rate BETWEEN 0.5 AND 1.5),
 provider text NOT NULL, provider_version text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed')),
 storage_key text, mime_type text, duration_ms integer CHECK(duration_ms >= 0), error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,child_id),
 CHECK(num_nonnulls(child_word_id,sentence_id)=1),
 CHECK(status <> 'succeeded' OR storage_key IS NOT NULL),
 FOREIGN KEY(child_word_id,child_id) REFERENCES child_words(id,child_id),
 FOREIGN KEY(sentence_id,child_id) REFERENCES sentences(id,child_id),
 UNIQUE NULLS NOT DISTINCT(child_id,child_word_id,sentence_id,content_version,content_hash,pronunciation_key,accent,voice_id,speech_rate,provider,provider_version)
);
COMMENT ON TABLE audio_assets IS '0.1 按孩子存储音频；不返回公共存储地址，播放入口每次验证家庭权限';

CREATE TABLE review_cards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), child_id uuid NOT NULL, child_word_id uuid NOT NULL,
 card_type text NOT NULL DEFAULT 'meaning' CHECK(card_type IN ('meaning','spelling','listening')),
 state text NOT NULL DEFAULT 'new' CHECK(state IN ('new','learning','review','relearning')),
 due_at timestamptz NOT NULL DEFAULT now(), last_review_at timestamptz,
 scheduler_state jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(scheduler_state)='object'),
 scheduler_version text NOT NULL, parameter_version text NOT NULL,
 desired_retention numeric(4,3) NOT NULL DEFAULT 0.9 CHECK(desired_retention > 0 AND desired_retention < 1),
 version integer NOT NULL DEFAULT 1 CHECK(version > 0), suspended_at timestamptz,
 UNIQUE(id,child_id), UNIQUE(child_id,child_word_id,card_type),
 FOREIGN KEY(child_word_id,child_id) REFERENCES child_words(id,child_id)
);
COMMENT ON TABLE review_cards IS '每孩子每义项每题型独立 FSRS 状态；scheduler_state 存所锁定库完整序列化状态';
CREATE TABLE study_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), child_id uuid NOT NULL REFERENCES children(id),
 actor_user_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended','expired','taken_over','revoked')),
 started_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 ended_at timestamptz, UNIQUE(id,child_id), CHECK(expires_at > started_at)
);
CREATE UNIQUE INDEX one_active_session_per_child ON study_sessions(child_id) WHERE status='active';
COMMENT ON TABLE study_sessions IS '孩子独占陪学租约；锁 children 行后先关闭过期会话再创建，不在索引中使用 now()';
CREATE TABLE review_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), child_id uuid NOT NULL,
 card_id uuid NOT NULL, session_id uuid NOT NULL, actor_user_id uuid REFERENCES users(id),
 event_id uuid NOT NULL, request_hash text NOT NULL,
 rating text NOT NULL CHECK(rating IN ('again','hard','good','easy')),
 reviewed_at timestamptz NOT NULL DEFAULT now(), local_date date NOT NULL, timezone_snapshot text NOT NULL,
 before_version integer NOT NULL, after_version integer NOT NULL,
 practice_only boolean NOT NULL DEFAULT false,
 review_source text NOT NULL DEFAULT 'scheduled' CHECK(review_source IN ('scheduled','calendar','manual','quiz')),
 word_snapshot jsonb NOT NULL CHECK(jsonb_typeof(word_snapshot)='object'),
 before_state jsonb NOT NULL, after_state jsonb NOT NULL, response_snapshot jsonb NOT NULL,
 UNIQUE(id,child_id), UNIQUE(child_id,event_id), CHECK((practice_only AND after_version=before_version) OR (NOT practice_only AND after_version=before_version+1)),
 FOREIGN KEY(card_id,child_id) REFERENCES review_cards(id,child_id),
 FOREIGN KEY(session_id,child_id) REFERENCES study_sessions(id,child_id)
);
COMMENT ON TABLE review_logs IS '不可变复习事件；事件键持久去重、存前后状态和第一次响应，操作家长可匿名化';
CREATE TABLE daily_word_activity (
 child_id uuid NOT NULL, local_date date NOT NULL, card_id uuid NOT NULL,
 child_word_id uuid NOT NULL, first_review_at timestamptz NOT NULL, was_new boolean NOT NULL,
 PRIMARY KEY(child_id,local_date,child_word_id),
 FOREIGN KEY(child_word_id,child_id) REFERENCES child_words(id,child_id),
 FOREIGN KEY(card_id,child_id) REFERENCES review_cards(id,child_id)
);
COMMENT ON TABLE daily_word_activity IS '每天每义项一行，数据库约束保证两个家长重复练习不重复计学习词数';
CREATE TABLE daily_activity (
 child_id uuid NOT NULL REFERENCES children(id), local_date date NOT NULL,
 distinct_words integer NOT NULL DEFAULT 0 CHECK(distinct_words >= 0),
 new_words integer NOT NULL DEFAULT 0 CHECK(new_words >= 0 AND new_words <= distinct_words),
 goal_snapshot integer NOT NULL CHECK(goal_snapshot > 0), timezone_snapshot text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(child_id,local_date)
);
COMMENT ON TABLE daily_activity IS '可重建每日汇总；达标由 distinct_words >= goal_snapshot 推导，不冗余存储';

CREATE TABLE generation_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), child_id uuid NOT NULL REFERENCES children(id),
 requested_by uuid REFERENCES users(id), kind text NOT NULL CHECK(kind IN ('sentences','audio','export','quiz_prepare')),
 dedupe_key text NOT NULL, payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','partial','succeeded','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
 max_attempts integer NOT NULL DEFAULT 2 CHECK(max_attempts BETWEEN 1 AND 5),
 run_after timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
 result jsonb, error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(child_id,kind,dedupe_key)
);
COMMENT ON TABLE generation_jobs IS '持久化任务；FOR UPDATE SKIP LOCKED 领取；外部供应商计费无法靠本地事务保证恰好一次';
CREATE TABLE lifecycle_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 requested_by uuid NOT NULL REFERENCES users(id),
 family_id uuid NOT NULL, target_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('delete_child','delete_family')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed')),
 phase text NOT NULL DEFAULT 'freeze' CHECK(phase IN ('freeze','objects','records','complete')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
 lease_until timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 error_code text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 CHECK((status = 'succeeded') = (completed_at IS NOT NULL)),
 CHECK((status = 'succeeded') = (phase = 'complete')),
 UNIQUE(kind,target_id)
);
COMMENT ON TABLE lifecycle_jobs IS '删除凭据与恢复清单；family_id/target_id为不带外键的历史UUID，目标删除后仍可查询；仅发起者本人可读，不存昵称或学习正文';
CREATE INDEX lifecycle_jobs_pending ON lifecycle_jobs(next_attempt_at) WHERE status IN ('queued','running');

CREATE TABLE idempotency_keys (
 actor_user_id uuid NOT NULL REFERENCES users(id), operation text NOT NULL, key varchar(128) NOT NULL,
 request_hash text NOT NULL, status text NOT NULL CHECK(status IN ('running','completed')),
 http_status integer CHECK(http_status BETWEEN 200 AND 599), response_body jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 PRIMARY KEY(actor_user_id,operation,key), CHECK(expires_at > created_at)
);
COMMENT ON TABLE idempotency_keys IS '通用写请求去重，24 小时保留；复习事件另外持久去重';
CREATE TABLE audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), family_id uuid NOT NULL REFERENCES families(id),
 actor_user_id uuid REFERENCES users(id), action text NOT NULL, target_type text NOT NULL,
 target_id uuid NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE audit_logs IS '家庭成员、档案及内容修改审计，不存登录或邀请明文凭证';

CREATE INDEX members_by_user ON family_members(user_id) WHERE status='active';
CREATE INDEX children_by_family ON children(family_id) WHERE archived_at IS NULL;
CREATE INDEX wordbooks_by_child ON wordbooks(child_id,created_at,id) WHERE archived_at IS NULL;
CREATE INDEX words_by_child ON child_words(child_id,normalized_lemma,id) WHERE archived_at IS NULL;
CREATE INDEX invites_by_family ON family_invites(family_id,status,created_at);
CREATE INDEX due_cards ON review_cards(child_id,due_at,id) WHERE suspended_at IS NULL;
CREATE INDEX logs_by_child ON review_logs(child_id,reviewed_at,id);
CREATE INDEX sentences_by_child ON sentences(child_id,created_at,id);
CREATE INDEX jobs_to_run ON generation_jobs(run_after,id) WHERE status IN ('queued','partial');
CREATE INDEX audit_by_family ON audit_logs(family_id,created_at,id);

-- 学习数据使用 RESTRICT（默认）外键。物理删除由后台按依赖顺序执行；归档不影响审计。
-- owner 必须为 active 成员、资源授权、状态迁移、时区合法性、FSRS 运算均由服务端事务保证。

-- 完整0.1功能：标注、纠错、复习快照队列、月测及统一错题事件。
CREATE TABLE word_annotations (
 child_id uuid NOT NULL, child_word_id uuid NOT NULL,
 easy boolean NOT NULL DEFAULT false, error_prone boolean NOT NULL DEFAULT false,
 favorite boolean NOT NULL DEFAULT false, manual_needs_correction boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(child_id,child_word_id), CHECK(NOT(easy AND error_prone)),
 FOREIGN KEY(child_word_id,child_id) REFERENCES child_words(id,child_id)
);
COMMENT ON TABLE word_annotations IS '孩子义项标注；简单与易错互斥；待纠错展示为手动标记与pending纠错记录的并集';
CREATE TABLE word_corrections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), child_id uuid NOT NULL, child_word_id uuid NOT NULL,
 sentence_id uuid, kind text NOT NULL CHECK(kind IN ('spelling','meaning','ipa','sentence','other')),
 before_snapshot jsonb NOT NULL CHECK(jsonb_typeof(before_snapshot)='object'),
 proposed_snapshot jsonb NOT NULL CHECK(jsonb_typeof(proposed_snapshot)='object'),
 base_version integer NOT NULL CHECK(base_version>0),
 note varchar(1000) NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','rejected','cancelled')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid REFERENCES users(id), resolved_by uuid REFERENCES users(id),
 resolution_note varchar(1000), created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz,
 UNIQUE(id,child_id),
 CHECK((kind='sentence')=(sentence_id IS NOT NULL)),
 CHECK((status='pending' AND resolved_at IS NULL) OR (status<>'pending' AND resolved_at IS NOT NULL)),
 FOREIGN KEY(child_word_id,child_id) REFERENCES child_words(id,child_id),
 FOREIGN KEY(sentence_id,child_id) REFERENCES sentences(id,child_id)
);
COMMENT ON TABLE word_corrections IS '成员提交、管理员处理；不改变lemma/词性/sense_key的编辑才可原地应用';
CREATE TABLE monthly_quizzes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), child_id uuid NOT NULL REFERENCES children(id),
 month date NOT NULL CHECK(extract(day FROM month)=1), timezone_snapshot text NOT NULL,
 mode text NOT NULL CHECK(mode IN ('sample','full')), requested_count integer,
 candidate_word_ids jsonb NOT NULL CHECK(jsonb_typeof(candidate_word_ids)='array'),
 eligible_count integer NOT NULL CHECK(eligible_count BETWEEN 1 AND 10000),
 excluded_count integer NOT NULL DEFAULT 0 CHECK(excluded_count>=0),
 total_count integer NOT NULL CHECK(total_count BETWEEN 1 AND 10000),
 correct_count integer, unanswered_count integer, grade text,
 grading_rule_snapshot jsonb NOT NULL CHECK(jsonb_typeof(grading_rule_snapshot)='object'),
 question_type text NOT NULL DEFAULT 'meaning_choice' CHECK(question_type='meaning_choice'),
 status text NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing','ready','in_progress','submitted','abandoned','failed')),
 created_by uuid REFERENCES users(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz,
 submitted_at timestamptz, submitted_local_date date,
 UNIQUE(id,child_id),
 CHECK((mode='sample' AND requested_count IS NOT NULL AND requested_count IN (10,20,30,50)) OR (mode='full' AND requested_count IS NULL)),
 CHECK(jsonb_array_length(candidate_word_ids)=eligible_count),
 CHECK((mode='full' AND total_count=eligible_count) OR (mode='sample' AND total_count=least(requested_count,eligible_count))),
 CHECK((status='submitted' AND correct_count IS NOT NULL AND unanswered_count IS NOT NULL AND grade IS NOT NULL AND submitted_at IS NOT NULL AND submitted_local_date IS NOT NULL
 AND correct_count>=0 AND unanswered_count>=0 AND correct_count+unanswered_count<=total_count
 AND grade=CASE WHEN correct_count*100>=total_count*90 THEN 'excellent' WHEN correct_count*100>=total_count*80 THEN 'good' WHEN correct_count*100>=total_count*60 THEN 'pass' ELSE 'needs_work' END)
 OR (status<>'submitted' AND correct_count IS NULL AND unanswered_count IS NULL AND grade IS NULL AND submitted_at IS NULL AND submitted_local_date IS NULL))
);
CREATE UNIQUE INDEX one_active_quiz_per_child ON monthly_quizzes(child_id) WHERE status IN ('preparing','ready','in_progress');
COMMENT ON TABLE monthly_quizzes IS '月测候选集、规则及最终成绩快照；sample/full可比较范围明确；四档按整数交叉乘积判断';
CREATE TABLE monthly_quiz_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quiz_id uuid NOT NULL, child_id uuid NOT NULL, child_word_id uuid NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 10000),
 word_snapshot jsonb NOT NULL CHECK(jsonb_typeof(word_snapshot)='object'),
 prompt_snapshot text, options_snapshot jsonb CHECK(options_snapshot IS NULL OR (jsonb_typeof(options_snapshot)='array' AND jsonb_array_length(options_snapshot)=4)),
 correct_option_id text, selected_option_id text,
 answer_version integer NOT NULL DEFAULT 1 CHECK(answer_version>0),
 flagged boolean NOT NULL DEFAULT false, is_correct boolean, answered_at timestamptz,
 UNIQUE(id,child_id), UNIQUE(quiz_id,ordinal), UNIQUE(quiz_id,child_word_id),
 CHECK(num_nonnulls(prompt_snapshot,options_snapshot,correct_option_id) IN (0,3)),
 CHECK(selected_option_id IS NULL OR correct_option_id IS NOT NULL),
 FOREIGN KEY(quiz_id,child_id) REFERENCES monthly_quizzes(id,child_id),
 FOREIGN KEY(child_word_id,child_id) REFERENCES child_words(id,child_id)
);
COMMENT ON TABLE monthly_quiz_items IS '只提交前端安全DTO；正确选项和解析在正式交卷前不可返回；选项属于本题由应用校验';
ALTER TABLE study_sessions ADD COLUMN purpose text NOT NULL DEFAULT 'review' CHECK(purpose IN ('review','quiz'));
ALTER TABLE study_sessions ADD COLUMN review_source text NOT NULL DEFAULT 'scheduled' CHECK(review_source IN ('scheduled','calendar','manual','quiz'));
ALTER TABLE study_sessions ADD COLUMN source_date date;
ALTER TABLE study_sessions ADD COLUMN quiz_id uuid;
ALTER TABLE study_sessions ADD COLUMN lease_generation integer NOT NULL DEFAULT 1 CHECK(lease_generation>0);
ALTER TABLE study_sessions ADD FOREIGN KEY(quiz_id,child_id) REFERENCES monthly_quizzes(id,child_id);
ALTER TABLE study_sessions ADD CHECK((purpose='quiz' OR review_source='quiz')=(quiz_id IS NOT NULL));
ALTER TABLE study_sessions ADD CHECK((review_source='calendar')=(source_date IS NOT NULL));
CREATE TABLE study_session_items (
 session_id uuid NOT NULL, child_id uuid NOT NULL, card_id uuid NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal>0), practice_only boolean NOT NULL,
 answered_event_id uuid, added_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id,card_id), UNIQUE(session_id,ordinal),
 FOREIGN KEY(session_id,child_id) REFERENCES study_sessions(id,child_id),
 FOREIGN KEY(card_id,child_id) REFERENCES review_cards(id,child_id),
 FOREIGN KEY(child_id,answered_event_id) REFERENCES review_logs(child_id,event_id)
);
COMMENT ON TABLE study_session_items IS '服务端快照复习队列；每个队列项首次提交一次，重练重新开会话；月测错题队列不限100词并分页';
CREATE TABLE mistake_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), child_id uuid NOT NULL, child_word_id uuid NOT NULL,
 source text NOT NULL CHECK(source IN ('review','monthly_quiz')),
 review_log_id uuid, quiz_item_id uuid,
 reason text NOT NULL CHECK(reason IN ('incorrect','unanswered')),
 occurred_at timestamptz NOT NULL DEFAULT now(), local_date date NOT NULL, timezone_snapshot text NOT NULL,
 word_snapshot jsonb NOT NULL CHECK(jsonb_typeof(word_snapshot)='object'),
 answer_snapshot jsonb NOT NULL CHECK(jsonb_typeof(answer_snapshot)='object'),
 CHECK((source='review' AND review_log_id IS NOT NULL AND quiz_item_id IS NULL AND reason='incorrect') OR
       (source='monthly_quiz' AND quiz_item_id IS NOT NULL AND review_log_id IS NULL)),
 FOREIGN KEY(child_word_id,child_id) REFERENCES child_words(id,child_id),
 FOREIGN KEY(review_log_id,child_id) REFERENCES review_logs(id,child_id),
 FOREIGN KEY(quiz_item_id,child_id) REFERENCES monthly_quiz_items(id,child_id)
);
CREATE UNIQUE INDEX mistake_once_per_review ON mistake_events(review_log_id) WHERE review_log_id IS NOT NULL;
CREATE UNIQUE INDEX mistake_once_per_quiz_item ON mistake_events(quiz_item_id) WHERE quiz_item_id IS NOT NULL;
COMMENT ON TABLE mistake_events IS '统一错题事件事实；review again与已交卷月测错误同事务写入，日历不再重复合并review_logs';
CREATE INDEX annotations_by_child ON word_annotations(child_id,favorite,error_prone);
CREATE INDEX corrections_pending ON word_corrections(child_id,child_word_id) WHERE status='pending';
CREATE INDEX quizzes_by_month ON monthly_quizzes(child_id,month,created_at,id);
CREATE INDEX mistakes_by_day ON mistake_events(child_id,local_date,child_word_id);
CREATE INDEX mistakes_by_word ON mistake_events(child_id,child_word_id,occurred_at,id);
CREATE INDEX daily_words_by_month ON daily_word_activity(child_id,local_date,child_word_id);
-- 行级业务权限由服务端检查；不可变事件、选项合法性、状态转换及精确词关联还需事务业务层。

COMMIT;
