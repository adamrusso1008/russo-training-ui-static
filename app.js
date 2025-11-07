(function () {
  const $ = (sel) => document.querySelector(sel);
  const log = (m) => {
    $('#log').textContent =
      `${new Date().toLocaleTimeString()} — ${m}\n` +
      ($('#log').textContent || '');
  };

  const baseUrl = $('#baseUrl');
  const userId = $('#userId');
  const healthBox = $('#healthBox');
  const planBox = $('#planBox');
  const planMeta = $('#planMeta');
  const coachNotes = $('#coachNotes');

  const ouraPayload = $('#ouraPayload');
  const workoutPayload = $('#workoutPayload');

  // Default payloads that match your API’s expectations
  ouraPayload.value = JSON.stringify(
    {
      user_id: 'russo_training',
      date: new Date().toISOString().slice(0, 10),
      readiness_score: 66,
      sleep_hours: 7.2,
      rhr: 59,
      hrv: 36
    },
    null,
    2
  );

  workoutPayload.value = JSON.stringify(
    {
      user_id: 'russo_training',
      platform: 'healthkit',
      type: 'run',
      start_time: new Date().toISOString(),
      duration_min: 30,
      avg_hr: 140,
      time_in_zones: { z2: 20, z3: 10 }
    },
    null,
    2
  );

  async function api(path, init) {
    const url = baseUrl.value.replace(/\/$/, '') + path;
    const res = await fetch(url, init);
    const ct = res.headers.get('content-type') || '';
    const body = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) throw new Error(typeof body === 'string' ? body : JSON.stringify(body));
    return body;
  }

  // GET /health
  $('#btnHealth').onclick = async () => {
    try {
      const data = await api('/health');
      healthBox.innerHTML = `<span class="mono">OK · ${data.ts}</span>`;
      log('Health OK');
    } catch (e) {
      healthBox.textContent = 'Error';
      log('Health ERROR: ' + e.message);
    }
  };

  // POST /v1/integrations/oura/webhook
  $('#btnOura').onclick = async () => {
    try {
      const payload = JSON.parse(ouraPayload.value);
      payload.user_id = userId.value;
      const data = await api('/v1/integrations/oura/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      log('Oura webhook OK: ' + JSON.stringify(data));
    } catch (e) {
      log('Oura webhook ERROR: ' + e.message);
    }
  };

  // GET /v1/integrations/oura/test
  $('#btnOuraTest').onclick = async () => {
    try {
      const data = await api('/v1/integrations/oura/test');
      log('Oura test OK: ' + JSON.stringify(data));
      alert('Oura test OK:\n' + JSON.stringify(data, null, 2));
    } catch (e) {
      log('Oura test ERROR: ' + e.message);
      alert('Oura test ERROR:\n' + e.message);
    }
  };

  // POST /v1/users/{user_id}/workouts
  $('#btnWorkout').onclick = async () => {
    try {
      const payload = JSON.parse(workoutPayload.value);
      payload.user_id = userId.value;
      const data = await api(`/v1/users/${encodeURIComponent(userId.value)}/workouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      log('Workout upload OK: ' + JSON.stringify(data));
    } catch (e) {
      log('Workout upload ERROR: ' + e.message);
    }
  };

  // GET /v1/generate_weekly_plan
  $('#btnPlan').onclick = async () => {
    try {
      const data = await api(
        `/v1/generate_weekly_plan?user_id=${encodeURIComponent(userId.value)}`
      );
      renderPlan(data);
      log('Plan generated');
    } catch (e) {
      log('Plan ERROR: ' + e.message);
    }
  };

  function renderPlan(data) {
    if (!data || !data.plan) {
      planBox.textContent = 'No plan';
      planMeta.textContent = '';
      coachNotes.innerHTML = '';
      return;
    }

    planMeta.textContent = `ACWR: ${data.acwr} · Readiness: ${data.readiness} · Sleep(h): ${data.sleep_hours}`;

    planBox.innerHTML = data.plan
      .map((d) => {
        const lines = Object.entries(d.details || {})
          .map(([k, v]) => `${label(k)}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join('\n');
        return `
          <div class="day">
            <div class="date">${d.day}</div>
            <div class="title">${title(d.session)}</div>
            <div class="mono" style="white-space:pre-wrap">${lines}</div>
          </div>`;
      })
      .join('');

    if (data.notes && data.notes.length) {
      coachNotes.innerHTML =
        '<div class="title">Coach Notes</div><ul>' +
        data.notes.map((n) => `<li>${n}</li>`).join('') +
        '</ul>';
    } else {
      coachNotes.innerHTML = '';
    }
  }

  const title = (s) =>
    s === 'long_run'
      ? 'Long Run (Z2)'
      : s === 'active_recovery'
      ? 'Active Recovery'
      : s.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const label = (s) => s.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
})();
