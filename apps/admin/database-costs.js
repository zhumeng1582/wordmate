'use strict';

window.DatabaseCosts = (() => {
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  const yuan = micros => micros === null ? '待录入' : `¥${(Number(micros) / 1e6).toFixed(2)}`;
  const amount = micros => (Number(micros) / 1e6).toFixed(2);
  const localDate = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const lastDate = month => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);

  function field(form, label, type, value = '', options = {}) {
    const wrapper = element('label', label, 'database-cost-field');
    const input = element('input');
    input.type = type;
    input.value = value;
    for (const [key, setting] of Object.entries(options)) input[key] = setting;
    wrapper.append(input);
    form.append(wrapper);
    return input;
  }

  function planInput(plan, revision) {
    return {
      expected_revision: revision,
      id: plan.id,
      reference: plan.reference,
      label: plan.label,
      amount_yuan: amount(plan.amount_micros),
      start_date: plan.start_date,
      end_date: plan.end_date,
      excluded: plan.excluded,
      note: plan.note,
    };
  }

  async function load({request, month, onMonthChange, onSaved, isCurrent}) {
    const data = await request(`/api/database-costs?month=${encodeURIComponent(month)}`);
    const root = element('div', undefined, 'database-costs');
    const toolbar = element('div', undefined, 'database-cost-toolbar');
    const monthLabel = element('label', '统计月份');
    const monthPicker = element('input');
    monthPicker.type = 'month';
    monthPicker.value = month;
    monthPicker.min = '2000-01';
    monthPicker.max = localDate().slice(0, 7);
    monthPicker.onchange = () => {
      if (isCurrent() && monthPicker.value) onMonthChange(monthPicker.value);
    };
    monthLabel.append(monthPicker);
    toolbar.append(monthLabel);
    root.append(toolbar);

    const labels = {missing_bill: 'RDS 账单待录入', partial: '累计账单，尚未结清整月', settled: '整月账单已录入'};
    root.append(element('p', `${labels[data.summary.status]}${data.as_of_date ? ` · 统计截至 ${data.as_of_date}` : ''}`, 'database-cost-status'));
    const summary = element('div', undefined, 'database-cost-summary');
    for (const [label, value] of [
      ['RDS 抵扣后应付', data.summary.rds_payable_micros],
      ['节省计划当期摊销', data.summary.plan_amortization_micros],
      ['数据库成本合计', data.summary.database_total_micros],
    ]) {
      const card = element('div', undefined, 'database-cost-metric');
      card.append(element('span', label), element('strong', yuan(value)));
      summary.append(card);
    }
    root.append(summary);
    root.append(element('p', '合计 = RDS 抵扣后账单应付 + 已购买节省计划当期摊销。未录入账单不按零费用计算；此处不含 ECS、OSS 和 AI 成本，也不会扣家庭钱包。', 'hint'));
    root.append(element('p', '计划按有效期自然日分摊，结束日期包含当日；小时级生效时间会有日粒度估算差异。只记录已确认合同，不会购买、退订或变更阿里云服务。', 'hint'));
    const notice = element('p', '', 'database-cost-notice');
    notice.setAttribute('role', 'status');
    root.append(notice);
    let saving = false;

    async function save(path, payload) {
      if (!isCurrent() || saving) return;
      saving = true;
      notice.textContent = '正在保存…';
      const buttons = [...root.querySelectorAll('button')];
      buttons.forEach(button => {button.disabled = true;});
      try {
        await request(path, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
        if (isCurrent()) await onSaved();
      } catch (error) {
        if (isCurrent()) notice.textContent = error.message || '保存结果未确认，请刷新核对后重试。';
      } finally {
        saving = false;
        buttons.forEach(button => {button.disabled = false;});
      }
    }

    const billSection = element('div', undefined, 'database-cost-section');
    billSection.append(element('h2', '录入 RDS 账单'));
    billSection.append(element('p', '填写阿里云账单中已扣除节省计划抵扣的应付金额，不含节省计划购买费；不要填抵扣前原价或账户充值金额。', 'hint'));
    const billForm = element('form', undefined, 'database-cost-form');
    const billAmount = field(billForm, 'RDS 应付金额（元）', 'number', data.bill ? amount(data.bill.amount_micros) : '', {required: true, min: '0', max: '9999999.99', step: '0.01'});
    const end = lastDate(month);
    const cutoff = end < localDate() ? end : localDate();
    const billDate = field(billForm, '账单截止日期', 'date', data.bill?.as_of_date || cutoff, {required: true, min: month + '-01', max: cutoff});
    const billNote = field(billForm, '备注（选填）', 'text', data.bill?.note || '', {maxLength: 200});
    const settledLabel = element('label', undefined, 'database-cost-check');
    const settled = element('input');
    settled.type = 'checkbox';
    settled.checked = data.bill?.settled || false;
    settled.disabled = end > localDate();
    settledLabel.append(settled, document.createTextNode('已核对整月最终账单（截止日期应为月末）'));
    const billSave = element('button', '保存本月账单');
    billSave.type = 'submit';
    billForm.append(settledLabel, billSave);
    billForm.onsubmit = event => {
      event.preventDefault();
      void save('/api/database-costs/bill', {
        expected_revision: data.revision,
        month,
        amount_yuan: billAmount.value,
        as_of_date: billDate.value,
        settled: settled.checked,
        note: billNote.value,
      });
    };
    billSection.append(billForm);
    root.append(billSection);

    const plansSection = element('div', undefined, 'database-cost-section');
    plansSection.append(element('h2', '已购买的节省计划'));
    const plansList = element('div', undefined, 'database-cost-plans');
    const planForm = element('form', undefined, 'database-cost-form');
    let planId = crypto.randomUUID();
    let excluded = false;
    const title = field(planForm, '计划名称', 'text', '', {required: true, maxLength: 60, placeholder: '例如：已购买的 1 年通用型计划'});
    const reference = field(planForm, '阿里云订单号或合同编号', 'text', '', {required: true, maxLength: 80, pattern: '[A-Za-z0-9][A-Za-z0-9._:-]{0,79}'});
    const total = field(planForm, '合同总成本（优惠后，元）', 'number', '', {required: true, min: '0', max: '9999999.99', step: '0.01'});
    const start = field(planForm, '有效期开始日期', 'date', '', {required: true});
    const finish = field(planForm, '有效期最后一天（含当日）', 'date', '', {required: true});
    const planNote = field(planForm, '备注（选填）', 'text', '', {maxLength: 200});
    const confirmedLabel = element('label', undefined, 'database-cost-check');
    const confirmed = element('input');
    confirmed.type = 'checkbox';
    confirmed.required = true;
    confirmedLabel.append(confirmed, document.createTextNode('确认这是已购买合同；不是报价。半预付或 0 预付也填写整个承诺期总成本。'));
    const planSave = element('button', '保存计划记录');
    planSave.type = 'submit';
    const newPlan = element('button', '清空并新增', 'secondary');
    newPlan.type = 'button';
    newPlan.onclick = () => {
      if (!isCurrent() || saving) return;
      planForm.reset();
      planId = crypto.randomUUID();
      excluded = false;
      planSave.textContent = '保存计划记录';
    };
    planForm.append(confirmedLabel, planSave, newPlan);
    planForm.onsubmit = event => {
      event.preventDefault();
      void save('/api/database-costs/plan', {
        expected_revision: data.revision,
        id: planId,
        reference: reference.value,
        label: title.value,
        amount_yuan: total.value,
        start_date: start.value,
        end_date: finish.value,
        excluded,
        note: planNote.value,
      });
    };

    if (!data.plans.length) plansList.append(element('p', '尚未录入计划。未购买时无需填写，RDS 实际账单仍可正常统计。', 'hint'));
    for (const plan of data.plans) {
      const row = element('div', undefined, 'database-cost-plan');
      row.append(element('strong', plan.label));
      row.append(element('p', `订单/合同编号：${plan.reference}`, 'hint'));
      row.append(element('p', `${plan.start_date} 至 ${plan.end_date} · 合同总成本 ${yuan(plan.amount_micros)}`));
      row.append(element('p', plan.excluded ? '已排除统计，可恢复；这不会退订阿里云计划。' : `当期摊销 ${yuan(plan.allocated_micros)}`, 'hint'));
      if (plan.note) row.append(element('p', plan.note, 'hint'));
      const actions = element('div', undefined, 'actions');
      const edit = element('button', '修改记录', 'secondary');
      edit.type = 'button';
      edit.onclick = () => {
        if (!isCurrent() || saving) return;
        planId = plan.id;
        excluded = plan.excluded;
        title.value = plan.label;
        reference.value = plan.reference;
        total.value = amount(plan.amount_micros);
        start.value = plan.start_date;
        finish.value = plan.end_date;
        planNote.value = plan.note;
        confirmed.checked = true;
        planSave.textContent = '保存修改';
        title.focus();
      };
      const toggle = element('button', plan.excluded ? '恢复统计' : '排除此条记录', 'secondary');
      toggle.type = 'button';
      toggle.onclick = () => {
        if (!isCurrent() || saving) return;
        if (!plan.excluded && !confirm('仅在重复或错误录入时排除此记录。该操作会重算历史统计，不会退订阿里云计划。继续吗？')) return;
        void save('/api/database-costs/plan', {...planInput(plan, data.revision), excluded: !plan.excluded});
      };
      actions.append(edit, toggle);
      row.append(actions);
      plansList.append(row);
    }
    plansSection.append(plansList, planForm);
    root.append(plansSection);
    return root;
  }

  return {load};
})();
