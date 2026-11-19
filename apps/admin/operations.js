'use strict';
window.AdminOperations = (() => {
  const kinds = [['words','英语单词'],['sentences','英语句子'],['poems','古诗词'],['hanzi','汉字']];
  const states = {all:'全部状态',active:'正常',archived:'已归档',queued:'排队中',running:'处理中',ready:'待核对保存',saved:'已保存',succeeded:'已完成',failed:'失败',partial:'部分完成',cancelled:'已取消',undone:'已撤销'};
  const issues = {
    source:'原文或身份',meaning:'释义或词性',phonetic:'音标',translation:'翻译',
    explanation:'注释或译文',pinyin:'拼音',structure:'部首或笔画',
    example:'组词或例句',audio:'正文发音',example_audio:'例句发音',
  };
  const fieldNames = {lemma:'单词',part_of_speech:'词性',meaning_zh:'中文释义',ipa_gb:'英式音标',ipa_us:'美式音标',text_en:'英文句子',translation_zh:'中文翻译',example_en:'英文例句',example_zh:'例句翻译',title:'标题',author:'作者',dynasty:'朝代',body:'原文',annotations:'注释',translation:'译文',character:'汉字',pinyin:'拼音',radical:'部首',strokes:'笔画',meaning:'释义',words:'组词',example:'例句'};
  const label = kind => kinds.find(item => item[0] === kind)?.[1] || kind;
  const money = value => value == null ? '未记录' : (Number(value)/1e6).toFixed(4);

  function filters({page,state,root,el,select,reload,openBooks}) {
    const change = (key,value) => { state[key] = value; reload(); };
    root.append(select(page === 'content' ? kinds : [['all','全部类型'],...kinds],state.kind,value => change('kind',value)));
    const options = page === 'content' ? ['all','active','archived'] : page === 'repairs' ? ['all','queued','running','succeeded','failed','undone'] : ['all','queued','running','ready','saved','failed','partial','succeeded','cancelled'];
    root.append(select(options.map(value => [value,states[value]]),state.status,value => change('status',value)));
    if (page === 'content') root.append(select([['all','全部来源'],['personal','个人内容'],['shared_copy','含共享副本']],state.origin,value => change('origin',value)));
    const term = el('input');
    term.placeholder = page === 'content' ? '搜索正文、释义或内容 ID' : '搜索任务 ID、内容 ID或错误码';
    if (page === 'imports') term.placeholder = '搜索任务 ID 或错误码';
    term.setAttribute('aria-label','搜索内容');
    term.maxLength = 120;
    term.value = state.q;
    const child = el('input');
    child.placeholder = '孩子 ID（可选）';
    child.setAttribute('aria-label','孩子 ID');
    child.value = state.child_id;
    const search = el('button','查询');
    search.onclick = () => { state.q = term.value.trim(); state.child_id = child.value.trim(); reload(); };
    for (const input of [term,child]) input.onkeydown = event => { if (event.key === 'Enter') search.click(); };
    root.append(term,child,search);
    if (page === 'content') {
      const books = el('button','按单词本查看','secondary');
      books.onclick = openBooks;
      root.append(books);
    }
  }

  // This reads existing resources only; both metadata and bytes are checked again on playback.
  function audio({request,audioBlob,el,select,trackUrl,isCurrent},target,labelText) {
    const root = el('div',undefined,'library-audio');
    const load = el('button',`读取${labelText}音频`,'secondary');
    const body = el('div');
    let urls = [];
    root.append(load,body);
    load.onclick = async () => {
      if (load.disabled) return;
      load.disabled = true;
      try {
        const query = new URLSearchParams(target);
        const clips = await request(`/api/content-clips?${query}`);
        if (!isCurrent() || !root.isConnected) return;
        for (const url of urls) URL.revokeObjectURL(url);
        urls = [];
        stop(body);
        body.replaceChildren();
        if (!clips.length) {
          body.append(el('span','暂无已生成音频','hint'));
          return;
        }
        const choice = select(clips.map(clip => [clip.id,`${clip.accent} · ${clip.voice_id} · ${clip.speech_rate}倍${clip.source === 'repair' ? ' · AI 已纠错' : ''}`]),clips[0].id,() => {
          player.pause();
          player.hidden = true;
        });
        choice.setAttribute('aria-label',`${labelText}音色`);
        const play = el('button',`试听${labelText}`,'secondary');
        const player = el('audio');
        player.controls = true;
        player.hidden = true;
        play.onclick = async () => {
          if (play.disabled) return;
          play.disabled = true;
          const selected = choice.value;
          choice.disabled = true;
          try {
            const clip = clips.find(item => item.id === selected);
            const path = clip.source === 'repair' ? `/api/library-repair-audio?id=${clip.id}`
              : clip.source === 'asset' ? `/api/library-audio?id=${clip.id}`
              : `/api/cached-content-audio?${new URLSearchParams({kind:target.kind,target:target.id,part:target.part,id:clip.id})}`;
            const url = await audioBlob(path);
            if (!isCurrent() || !body.isConnected || choice.value !== selected || player.parentNode !== body) {
              URL.revokeObjectURL(url);
              return;
            }
            for (const old of urls) URL.revokeObjectURL(old);
            urls = [url];
            trackUrl(url);
            player.src = url;
            player.hidden = false;
            await player.play();
          } catch (error) {
            if (isCurrent() && body.isConnected) {
              message.textContent = error.message;
              player.hidden = true;
            }
          } finally {
            play.disabled = false;
            choice.disabled = false;
          }
        };
        const message = el('span',undefined,'hint');
        message.setAttribute('role','status');
        body.append(choice,play,player,message);
      } catch (error) {
        if (isCurrent() && root.isConnected) body.replaceChildren(el('span',error.message,'hint'));
      } finally {
        load.disabled = false;
      }
    };
    return root;
  }

  function stop(root) {
    root.querySelectorAll('audio').forEach(player => player.pause());
  }

  async function load(context) {
    const {page,state,offset,request,el,table,date,isCurrent} = context;
    const endpoint = page === 'content' ? 'contents' : page === 'repairs' ? 'repair-records' : 'import-tasks';
    const data = await request(`/api/${endpoint}?${new URLSearchParams({...state,offset:String(offset)})}`);
    const root = el('div',undefined,'operations');
    const details = el('div',undefined,'operation-detail');
    let detailSequence = 0;
    function detailButton(text,fetchDetail,render) {
      const button = el('button',text,'secondary');
      button.onclick = async () => {
        const sequence = ++detailSequence;
        stop(details);
        details.replaceChildren(el('p','正在读取详情…','hint'));
        try {
          const result = await fetchDetail();
          if (!isCurrent() || sequence !== detailSequence) return;
          const close = el('button','收起详情','secondary');
          close.onclick = () => { ++detailSequence; stop(details); details.replaceChildren(); };
          details.replaceChildren(close,...render(result));
          details.scrollIntoView?.({block:'nearest',behavior:'smooth'});
        } catch (error) {
          if (isCurrent() && sequence === detailSequence) details.replaceChildren(el('p',error.message,'hint'));
        }
      };
      return button;
    }
    let headers,rows;
    if (page === 'content') {
      headers = ['内容 / ID','摘要','归属 / 来源','状态 / 版本','创建时间','操作'];
      rows = data.items.map(item => [
        `${item.title}\n${item.id}`,item.description,
        `孩子：${item.child_id}\n${item.book_names || '未加入内容本'}\n${item.shared_copy ? '含共享副本' : '个人内容'}`,
        `${item.archived_at ? '已归档' : '正常'} · v${item.version}`,date(item.created_at),
        detailButton('查看详情',() => request(`/api/content-detail?${new URLSearchParams({kind:state.kind,id:item.id})}`),detail => {
          const nodes = [el('h2',`${label(detail.kind)}详情`),el('p',`内容 ID：${detail.id}`,'hint'),table(['字段','当前内容'],Object.entries(detail.fields).map(([key,value]) => [fieldNames[key] || key,value]))];
          if (detail.example) nodes.push(el('h3','关联例句'),el('p',`${detail.example.text_en}\n${detail.example.translation_zh}`));
          if (detail.archived_at) return [...nodes,el('p','已归档内容不提供试听。','hint')];
          const parts = detail.kind === 'hanzi' ? [['character','汉字'],['example','例句']] : [[detail.kind === 'words' ? 'word' : 'body','正文']];
          for (const [part,text] of parts) nodes.push(audio(context,{kind:detail.kind,id:detail.id,part},text));
          if (detail.example) nodes.push(audio(context,{kind:'sentences',id:detail.example.id,part:'body'},'英文例句'));
          return nodes;
        }),
      ]);
    } else if (page === 'repairs') {
      headers = ['时间 / 记录 ID','内容 / 问题','状态 / 错误码','调用 / 已知成本 / 用户收费','操作'];
      rows = data.items.map(item => [
        `${date(item.created_at)}\n${item.id}`,`${label(item.kind)} · ${issues[item.issue] || item.issue}\n内容：${item.target_id}\n孩子：${item.child_id}`,
        `${states[item.status] || item.status}\n${item.error_code || ''}\n${item.note || ''}`,
        `${item.calls} 次 · ${item.recorded_cost} 次有成本\n${item.known_cost_micros == null ? '未记录成本' : '¥'+money(item.known_cost_micros)} / ¥${money(item.charge_micros)}`,
        detailButton('查看纠错',() => request(`/api/repair-detail?id=${item.id}`),detail => {
          const nodes = [el('h2','AI 纠错记录'),el('p',`${states[detail.status] || detail.status} · ${detail.error_code || '无错误码'}`),el('p',detail.description || '未补充说明','hint')];
          nodes.push(el('p','以下为历史纠错快照；当前内容以“内容管理”为准。已知成本仅汇总有记录的调用，用户收费单独列出。','hint'));
          if (detail.note) nodes.push(el('p',detail.note));
          nodes.push(table(['字段','纠错前','纠错结果'],Object.entries(detail.changes).map(([key,value]) => [fieldNames[key] || key,detail.original[key],value])));
          if (detail.diagnostic) nodes.push(table(['校验信息','值'],Object.entries(detail.diagnostic)));
          if (detail.pronunciations.length) nodes.push(table(['文字','音素体系','音素'],detail.pronunciations.map(item => [item.text,item.alphabet,item.ph])));
          if (detail.voice_id) nodes.push(el('p',`${detail.accent} · ${detail.voice_id} · ${detail.speech_rate}倍；${detail.current_audio ? '当前有效纠错音频' : '当前未采用此记录音频'}`,'hint'));
          if (detail.current_audio) nodes.push(audio(context,{kind:detail.audio_kind,id:detail.audio_target,part:detail.audio_part},'当前内容'));
          return nodes;
        }),
      ]);
    } else {
      headers = ['时间 / 任务 ID','类型 / 孩子','状态 / 错误码','保存 / 分批进度','执行信息'];
      rows = data.items.map(item => [
        `${date(item.created_at)}\n${item.id}`,`${label(item.kind)}\n${item.child_id}`,
        `${states[item.status] || item.status}\n${item.error_code || ''}${item.detail_available ? '' : '\n任务明细已清理，保留历史记录'}`,
        `已保存 ${item.saved_count} 条${item.pending_count ? `\n待核对 ${item.pending_count} 条` : ''}${item.total_batches ? `\n完成 ${item.completed_batches} / ${item.total_batches} 批` : ''}${item.read_total ? `\n已读 ${item.read_page} / ${item.read_total} 页` : ''}`,
        `${item.attempts == null ? '' : `已尝试 ${item.attempts} 次`}\n${item.lease_until ? `租约截止：${date(item.lease_until)}` : '无执行租约'}\n更新：${date(item.updated_at)}`,
      ]);
    }
    root.append(table(headers,rows),details);
    return {view:root,hasMore:data.next_offset !== null};
  }
  return {filters,load,audio};
})();
