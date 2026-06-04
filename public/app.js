'use strict';

// ===== 세션 / 상태 =====
const SS_KEY = 'eval_session';
let session = loadSession(); // { role, adminCode } | { role:'evaluator', id, name, code }
let publicConfig = null; // /api/config 결과
let adminSettings = null; // 관리자 전체 설정(코드 포함)
let applicantsCache = [];
let resultsCache = null;
let selectedApplicantId = null;

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SS_KEY)) || null; }
  catch { return null; }
}
function saveSession(s) {
  session = s;
  sessionStorage.setItem(SS_KEY, JSON.stringify(s));
}
function clearSession() {
  session = null;
  sessionStorage.removeItem(SS_KEY);
}

// ===== API 헬퍼 =====
function authHeaders() {
  const h = {};
  if (!session) return h;
  if (session.role === 'admin') h['x-admin-code'] = session.adminCode;
  if (session.role === 'evaluator') {
    h['x-evaluator-id'] = session.id;
    h['x-evaluator-code'] = session.code;
  }
  return h;
}

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (auth) Object.assign(headers, authHeaders());
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const err = new Error((data && (data.message || data.error)) || ('HTTP ' + res.status));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const $ = (id) => document.getElementById(id);
function show(viewId) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  $(viewId).classList.remove('hidden');
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ===== 초기화 =====
window.addEventListener('DOMContentLoaded', init);

async function init() {
  bindLogin();
  bindAdmin();
  $('logoutBtn').addEventListener('click', () => {
    clearSession();
    location.reload();
  });

  await loadPublicConfig();

  // 기존 세션 복원
  if (session && session.role === 'admin') return enterAdmin();
  if (session && session.role === 'evaluator') return enterEvaluator();
  show('view-login');
}

async function loadPublicConfig() {
  try {
    publicConfig = await api('/api/config', { auth: false });
  } catch {
    publicConfig = { setupComplete: false, title: '', rubric: [], evaluators: [] };
  }
  if (publicConfig.title) {
    $('appTitle').textContent = publicConfig.title;
    document.title = publicConfig.title;
  }
  // 심사위원 드롭다운
  const sel = $('evaluatorSelect');
  sel.innerHTML = '<option value="">— 이름 선택 —</option>' +
    (publicConfig.evaluators || [])
      .map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`)
      .join('');
  // 최초 설정 안내
  $('setupNotice').classList.toggle('hidden', !!publicConfig.setupComplete);
}

// ===== 로그인 =====
function bindLogin() {
  document.querySelectorAll('.role-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.role-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const role = tab.dataset.role;
      $('evaluatorLoginForm').classList.toggle('hidden', role !== 'evaluator');
      $('adminLoginForm').classList.toggle('hidden', role !== 'admin');
      hideLoginError();
    });
  });

  $('evaluatorLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideLoginError();
    const id = $('evaluatorSelect').value;
    const code = $('evaluatorCode').value.trim();
    if (!id) return showLoginError('이름을 선택하세요.');
    try {
      const r = await api('/api/login', { auth: false, method: 'POST',
        body: { role: 'evaluator', evaluatorId: id, code } });
      if (!r.ok) throw new Error();
      saveSession({ role: 'evaluator', id: r.id, name: r.name, code });
      enterEvaluator();
    } catch {
      showLoginError('이름 또는 접속코드가 올바르지 않습니다.');
    }
  });

  $('adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideLoginError();
    const code = $('adminCodeInput').value.trim();
    try {
      const r = await api('/api/login', { auth: false, method: 'POST',
        body: { role: 'admin', code } });
      if (!r.ok) throw new Error();
      saveSession({ role: 'admin', adminCode: code });
      enterAdmin();
    } catch (err) {
      if (err.data && err.data.error === 'NOT_SETUP')
        showLoginError('아직 설정이 완료되지 않았습니다. "최초 설정 시작"을 눌러 진행하세요.');
      else showLoginError('관리자 코드가 올바르지 않습니다.');
    }
  });

  // 최초 설정(부트스트랩): 인증 없이 설정 화면 진입
  $('bootstrapBtn').addEventListener('click', () => {
    saveSession({ role: 'admin', adminCode: '' }); // 코드 없이 부트스트랩
    adminSettings = { setupComplete: false, title: '', adminCode: '', rubric: [], evaluators: [] };
    renderAdminShell();
    renderSetupTab();
    switchAdminTab('setup');
  });
}
function showLoginError(msg) { const e = $('loginError'); e.textContent = msg; e.classList.remove('hidden'); }
function hideLoginError() { $('loginError').classList.add('hidden'); }

// ===== 관리자 =====
function bindAdmin() {
  document.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchAdminTab(tab.dataset.tab));
  });
  $('addRubricBtn').addEventListener('click', () => addRubricRow());
  $('addEvaluatorBtn').addEventListener('click', () => addEvaluatorRow());
  $('saveSetupBtn').addEventListener('click', saveSetup);
  $('uploadBtn').addEventListener('click', uploadPdfs);
  $('refreshApplicantsBtn').addEventListener('click', loadApplicantsAdmin);
  $('refreshResultsBtn').addEventListener('click', loadResults);
  $('resultSort').addEventListener('change', renderResults);
  $('exportCsvBtn').addEventListener('click', exportCsv);
}

function renderAdminShell() {
  show('view-admin');
  $('sessionInfo').classList.remove('hidden');
  $('sessionLabel').textContent = '행정직원(관리자)';
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.tab === tab));
  $('tab-setup').classList.toggle('hidden', tab !== 'setup');
  $('tab-upload').classList.toggle('hidden', tab !== 'upload');
  $('tab-results').classList.toggle('hidden', tab !== 'results');
  if (tab === 'upload') loadApplicantsAdmin();
  if (tab === 'results') loadResults();
}

async function enterAdmin() {
  renderAdminShell();
  try {
    const r = await api('/api/setup'); // GET 전체 설정(코드 포함)
    adminSettings = r.settings;
  } catch (err) {
    if (err.status === 401) {
      clearSession();
      show('view-login');
      showLoginError('관리자 코드가 올바르지 않습니다.');
      return;
    }
    adminSettings = { setupComplete: false, title: '', adminCode: '', rubric: [], evaluators: [] };
  }
  renderSetupTab();
  switchAdminTab('setup');
}

function renderSetupTab() {
  $('setTitle').value = adminSettings.title || '';
  $('setAdminCode').value = '';
  $('rubricRows').innerHTML = '';
  $('evaluatorRows').innerHTML = '';
  (adminSettings.rubric || []).forEach((r) => addRubricRow(r));
  (adminSettings.evaluators || []).forEach((e) => addEvaluatorRow(e));
  if (!(adminSettings.rubric || []).length) {
    // 기본 예시 항목
    [['연구실적', 40], ['교육경력', 30], ['전공적합성', 20], ['면접', 10]]
      .forEach(([name, max]) => addRubricRow({ name, max }));
  }
  if (!(adminSettings.evaluators || []).length) addEvaluatorRow();
}

function addRubricRow(r = {}) {
  const tr = document.createElement('tr');
  tr.dataset.id = r.id || '';
  tr.innerHTML =
    `<td><input class="r-name" type="text" value="${esc(r.name || '')}" placeholder="항목 이름" /></td>` +
    `<td><input class="r-max" type="number" min="0" value="${r.max != null ? r.max : ''}" placeholder="만점" /></td>` +
    `<td><button class="btn btn-danger btn-sm row-del">삭제</button></td>`;
  tr.querySelector('.row-del').addEventListener('click', () => tr.remove());
  $('rubricRows').appendChild(tr);
}

function addEvaluatorRow(e = {}) {
  const tr = document.createElement('tr');
  tr.dataset.id = e.id || '';
  tr.innerHTML =
    `<td><input class="e-name" type="text" value="${esc(e.name || '')}" placeholder="심사위원 이름" /></td>` +
    `<td><input class="e-code" type="text" value="${esc(e.code || '')}" placeholder="자동 생성됨" /></td>` +
    `<td>` +
      `<button class="btn btn-ghost btn-sm row-gen" title="코드 생성">코드</button> ` +
      `<button class="btn btn-danger btn-sm row-del">삭제</button>` +
    `</td>`;
  tr.querySelector('.row-del').addEventListener('click', () => tr.remove());
  tr.querySelector('.row-gen').addEventListener('click', () => {
    tr.querySelector('.e-code').value = Math.random().toString(36).slice(2, 8).toUpperCase();
  });
  $('evaluatorRows').appendChild(tr);
}

async function saveSetup() {
  const msg = $('setupMsg');
  msg.className = 'inline-msg';
  msg.textContent = '저장 중...';

  const rubric = [...$('rubricRows').children].map((tr) => ({
    id: tr.dataset.id || undefined,
    name: tr.querySelector('.r-name').value.trim(),
    max: Number(tr.querySelector('.r-max').value) || 0,
  })).filter((r) => r.name);

  const evaluators = [...$('evaluatorRows').children].map((tr) => ({
    id: tr.dataset.id || undefined,
    name: tr.querySelector('.e-name').value.trim(),
    code: tr.querySelector('.e-code').value.trim(),
  })).filter((e) => e.name);

  const newAdminCode = $('setAdminCode').value.trim();
  const isBootstrap = !adminSettings.setupComplete;
  if (isBootstrap && !newAdminCode) {
    msg.className = 'inline-msg err';
    msg.textContent = '최초 설정에는 관리자 코드가 필요합니다.';
    return;
  }
  if (!rubric.length) {
    msg.className = 'inline-msg err';
    msg.textContent = '채점 항목을 1개 이상 추가하세요.';
    return;
  }

  try {
    const r = await api('/api/setup', { method: 'POST', body: {
      title: $('setTitle').value.trim(),
      adminCode: newAdminCode || undefined,
      rubric,
      evaluators,
    }});
    adminSettings = r.settings;
    // 관리자 코드가 변경되었으면 세션 갱신
    saveSession({ role: 'admin', adminCode: adminSettings.adminCode });
    renderSetupTab();
    await loadPublicConfig();
    msg.className = 'inline-msg ok';
    msg.textContent = '저장되었습니다. 심사위원에게 이름과 접속코드를 전달하세요.';
  } catch (err) {
    msg.className = 'inline-msg err';
    msg.textContent = '저장 실패: ' + (err.message || '오류');
  }
}

// ===== PDF 업로드 =====
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadPdfs() {
  const input = $('pdfInput');
  const files = [...input.files];
  const box = $('uploadProgress');
  if (!files.length) { box.innerHTML = '<span class="err">PDF 파일을 선택하세요.</span>'; return; }

  $('uploadBtn').disabled = true;
  box.innerHTML = '';
  for (const file of files) {
    const row = document.createElement('div');
    row.className = 'row pending';
    row.textContent = `⏳ ${file.name} — 처리 중...`;
    box.appendChild(row);

    if (file.size > 5 * 1024 * 1024) {
      row.className = 'row err';
      row.textContent = `⚠️ ${file.name} — 파일이 너무 큽니다(5MB 초과). 압축 후 다시 시도하세요.`;
      continue;
    }
    try {
      const b64 = await fileToBase64(file);
      const r = await api('/api/applicants', { method: 'POST', body: {
        fileName: file.name, fileBase64: b64,
      }});
      row.className = 'row ok';
      row.textContent = `✅ ${file.name} — 등록 완료 (${r.applicant.displayName})`;
    } catch (err) {
      row.className = 'row err';
      row.textContent = `❌ ${file.name} — 실패: ${err.message || '오류'}`;
    }
  }
  $('uploadBtn').disabled = false;
  input.value = '';
  loadApplicantsAdmin();
}

async function loadApplicantsAdmin() {
  try {
    const r = await api('/api/applicants');
    applicantsCache = r.applicants || [];
  } catch { applicantsCache = []; }
  $('applicantCount').textContent = applicantsCache.length;
  const tbody = $('adminApplicantRows');
  tbody.innerHTML = applicantsCache.map((a) =>
    `<tr data-id="${esc(a.id)}">` +
      `<td><input class="ap-num" type="text" value="${esc(a.appNumber)}" style="margin:0" /></td>` +
      `<td><input class="ap-name" type="text" value="${esc(a.displayName)}" style="margin:0" /></td>` +
      `<td class="ap-summary">${esc((a.summary || '').slice(0, 120))}${(a.summary || '').length > 120 ? '…' : ''}</td>` +
      `<td><button class="btn btn-danger btn-sm ap-del">삭제</button></td>` +
    `</tr>`
  ).join('') || '<tr><td colspan="4" class="muted">등록된 지원자가 없습니다.</td></tr>';

  tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
    const id = tr.dataset.id;
    const save = async () => {
      try {
        await api('/api/applicants', { method: 'PATCH', body: {
          id,
          appNumber: tr.querySelector('.ap-num').value,
          displayName: tr.querySelector('.ap-name').value,
        }});
      } catch (e) { alert('저장 실패: ' + e.message); }
    };
    tr.querySelector('.ap-num').addEventListener('change', save);
    tr.querySelector('.ap-name').addEventListener('change', save);
    tr.querySelector('.ap-del').addEventListener('click', async () => {
      if (!confirm('이 지원자와 관련된 모든 점수가 삭제됩니다. 계속할까요?')) return;
      await api('/api/applicants?id=' + encodeURIComponent(id), { method: 'DELETE' });
      loadApplicantsAdmin();
    });
  });
}

// ===== 결과 취합 =====
async function loadResults() {
  const body = $('resultsBody');
  body.innerHTML = '<tr><td>불러오는 중...</td></tr>';
  try {
    resultsCache = await api('/api/results');
  } catch (e) {
    body.innerHTML = `<tr><td class="err">불러오기 실패: ${esc(e.message)}</td></tr>`;
    return;
  }
  renderResults();
}

function sortedResultRows() {
  if (!resultsCache) return [];
  const rows = [...resultsCache.rows];
  const mode = $('resultSort').value;
  if (mode === 'rank') {
    rows.sort((a, b) => b.average - a.average || b.sum - a.sum);
  } else {
    rows.sort((a, b) =>
      String(a.appNumber).localeCompare(String(b.appNumber), undefined, { numeric: true }));
  }
  return rows;
}

function renderResults() {
  if (!resultsCache) return;
  const evaluators = resultsCache.evaluators || [];
  const head = $('resultsHead');
  const mode = $('resultSort').value;

  head.innerHTML =
    '<tr>' +
    (mode === 'rank' ? '<th>순위</th>' : '') +
    '<th>접수번호</th><th>이름</th>' +
    evaluators.map((e) => `<th>${esc(e.name)}</th>`).join('') +
    '<th>평균</th><th>합계</th><th>제출</th>' +
    '</tr>';

  const rows = sortedResultRows();
  const body = $('resultsBody');
  if (!rows.length) {
    body.innerHTML = '<tr><td class="muted">데이터가 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = rows.map((row, i) => {
    const cells = row.evaluatorScores.map((s) =>
      `<td class="num">${s.submitted ? s.total : '<span class="muted">-</span>'}</td>`).join('');
    return '<tr>' +
      (mode === 'rank' ? `<td class="center"><span class="rank-badge">${i + 1}</span></td>` : '') +
      `<td>${esc(row.appNumber)}</td>` +
      `<td>${esc(row.displayName)}</td>` +
      cells +
      `<td class="num"><strong>${row.average}</strong></td>` +
      `<td class="num">${row.sum}</td>` +
      `<td class="center">${row.submittedCount}/${row.evaluatorCount}</td>` +
      '</tr>';
  }).join('');
}

function exportCsv() {
  if (!resultsCache) return;
  const evaluators = resultsCache.evaluators || [];
  const header = ['접수번호', '이름', ...evaluators.map((e) => e.name), '평균', '합계', '제출현황'];
  const rows = sortedResultRows().map((row) => [
    row.appNumber,
    row.displayName,
    ...row.evaluatorScores.map((s) => (s.submitted ? s.total : '')),
    row.average,
    row.sum,
    `${row.submittedCount}/${row.evaluatorCount}`,
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `심사결과_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== 심사위원 =====
let myScores = {}; // applicantId -> score record

async function enterEvaluator() {
  show('view-evaluator');
  $('sessionInfo').classList.remove('hidden');
  $('sessionLabel').textContent = `심사위원: ${session.name}`;
  await Promise.all([loadEvalApplicants(), loadMyScores()]);
  renderEvalList();
}

async function loadEvalApplicants() {
  try {
    const r = await api('/api/applicants');
    applicantsCache = r.applicants || [];
  } catch (e) {
    if (e.status === 401) { clearSession(); location.reload(); return; }
    applicantsCache = [];
  }
}

async function loadMyScores() {
  myScores = {};
  try {
    const r = await api('/api/scores');
    (r.scores || []).forEach((s) => { myScores[s.applicantId] = s; });
  } catch { /* ignore */ }
}

function renderEvalList() {
  const ul = $('evalApplicantList');
  const done = applicantsCache.filter((a) => myScores[a.id]).length;
  $('evalProgress').textContent =
    `채점 완료: ${done} / ${applicantsCache.length}`;

  ul.innerHTML = applicantsCache.map((a) =>
    `<li data-id="${esc(a.id)}" class="${a.id === selectedApplicantId ? 'active' : ''}">` +
      `<div class="ap-num">접수번호 ${esc(a.appNumber || '-')}</div>` +
      `<div class="ap-name">${esc(a.displayName)}</div>` +
      (myScores[a.id] ? `<div class="ap-done">✓ 제출함 (${myScores[a.id].total}점)</div>` : '') +
    `</li>`
  ).join('') || '<li class="muted">등록된 지원자가 없습니다.</li>';

  ul.querySelectorAll('li[data-id]').forEach((li) => {
    li.addEventListener('click', () => selectApplicant(li.dataset.id));
  });
}

function selectApplicant(id) {
  selectedApplicantId = id;
  renderEvalList();
  const a = applicantsCache.find((x) => x.id === id);
  if (!a) return;
  const rubric = publicConfig.rubric || [];
  const existing = myScores[id];

  const fields = (a.fields || []).map((f) =>
    `<div class="label">${esc(f.label)}</div><div>${esc(f.value)}</div>`).join('');

  const scoreRows = rubric.map((r) => {
    const val = existing && existing.scores ? (existing.scores[r.id] ?? '') : '';
    return `<div class="score-row">` +
      `<div><span class="s-name">${esc(r.name)}</span> <span class="s-max">/ ${r.max}점</span></div>` +
      `<input class="score-input" data-rid="${esc(r.id)}" data-max="${r.max}" type="number" min="0" max="${r.max}" value="${val}" />` +
    `</div>`;
  }).join('');

  $('evalDetail').innerHTML =
    `<h2>${esc(a.displayName)} <span class="muted" style="font-size:14px">(접수번호 ${esc(a.appNumber || '-')})</span></h2>` +
    (fields ? `<div class="field-grid">${fields}</div>` : '') +
    (a.summary ? `<div class="summary-box">${esc(a.summary)}</div>` : '') +
    `<div class="score-form">` +
      `<h3>채점 ${existing ? '<span class="ap-done">(저장됨)</span>' : ''}</h3>` +
      scoreRows +
      `<label>심사 의견(선택)<textarea class="score-comment" rows="3">${esc(existing ? existing.comment : '')}</textarea></label>` +
      `<div class="score-total">합계: <span id="scoreTotal">0</span>점</div>` +
      `<button class="btn btn-primary" id="saveScoreBtn">점수 저장</button>` +
      `<span id="scoreMsg" class="inline-msg"></span>` +
    `</div>`;

  const recompute = () => {
    let t = 0;
    $('evalDetail').querySelectorAll('.score-input').forEach((inp) => {
      let v = Number(inp.value) || 0;
      const max = Number(inp.dataset.max);
      if (v > max) { v = max; inp.value = max; }
      if (v < 0) { v = 0; inp.value = 0; }
      t += v;
    });
    $('scoreTotal').textContent = t;
  };
  $('evalDetail').querySelectorAll('.score-input').forEach((inp) =>
    inp.addEventListener('input', recompute));
  recompute();

  $('saveScoreBtn').addEventListener('click', () => saveScore(id));
}

async function saveScore(id) {
  const scores = {};
  $('evalDetail').querySelectorAll('.score-input').forEach((inp) => {
    scores[inp.dataset.rid] = Number(inp.value) || 0;
  });
  const comment = $('evalDetail').querySelector('.score-comment').value;
  const msg = $('scoreMsg');
  msg.className = 'inline-msg';
  msg.textContent = '저장 중...';
  try {
    const r = await api('/api/scores', { method: 'POST', body: { applicantId: id, scores, comment } });
    myScores[id] = r.score;
    msg.className = 'inline-msg ok';
    msg.textContent = '저장되었습니다.';
    renderEvalList();
  } catch (e) {
    msg.className = 'inline-msg err';
    msg.textContent = '저장 실패: ' + (e.message || '오류');
  }
}
