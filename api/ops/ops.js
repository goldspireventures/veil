/**
 * Veil platform ops dashboard — served from API host only (veil-api…/ops.html).
 */
(function (global) {
  const TOKEN_KEY = 'veilOpsToken';
  let refreshTimer = null;

  function apiBase() {
    return String(global.location?.origin || '').replace(/\/$/, '');
  }

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(value) {
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function statClass(value, { warnBelow = 99, badBelow = 95 } = {}) {
    const n = Number(value);
    if (Number.isNaN(n)) return '';
    if (n < badBelow) return 'ops-stat--bad';
    if (n < warnBelow) return 'ops-stat--warn';
    return 'ops-stat--ok';
  }

  async function fetchSummary(days) {
    const t = token();
    if (!t) throw new Error('Enter your platform ops token.');
    const response = await fetch(`${apiBase()}/v1/ops/summary?days=${days}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error('Invalid ops token.');
    }
    if (response.status === 429) {
      throw new Error('Rate limited — wait a minute and retry.');
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || body.error || `Request failed (${response.status}).`);
    }
    return response.json();
  }

  function renderTable(headers, rows, emptyColspan) {
    if (!rows) return `<p class="hint-inline">No data.</p>`;
    const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
    const body = rows.length
      ? rows.join('')
      : `<tr><td colspan="${emptyColspan}">No data in this window.</td></tr>`;
    return `<table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function renderSummary(container, data) {
    const avail = data.availability || {};
    const org = data.orgStats || {};
    const pct = avail.availability_pct != null ? `${avail.availability_pct}%` : '—';

    const synthetic = (data.syntheticChecks || []).map((row) => {
      const at = row.checked_at ? new Date(row.checked_at).toLocaleString() : '';
      const status = row.ok ? 'OK' : 'FAIL';
      return `<tr>
        <td>${escapeHtml(row.target_name)}</td>
        <td>${escapeHtml(status)}</td>
        <td>${row.status_code ?? '—'}</td>
        <td>${row.latency_ms ?? '—'}ms</td>
        <td>${escapeHtml(at)}</td>
        <td>${escapeHtml(row.message)}</td>
      </tr>`;
    });

    const health = (data.health || []).slice(0, 24).map((row) => {
      const at = row.checked_at ? new Date(row.checked_at).toLocaleString() : '';
      const status = row.ok ? (row.db_ok ? 'OK' : 'DB down') : 'Degraded';
      return `<tr>
        <td>${escapeHtml(at)}</td>
        <td>${escapeHtml(status)}</td>
        <td>${escapeHtml(row.version)}</td>
        <td title="Process uptime when sampled — not SLA">${row.uptime_sec || 0}s</td>
      </tr>`;
    });

    const kinds = (data.eventsByKind || []).map((row) =>
      `<tr><td>${escapeHtml(row.kind)}</td><td>${row.count}</td></tr>`,
    );

    const versions = (data.extensionVersions || []).map((row) =>
      `<tr><td>${escapeHtml(row.extension_version)}</td><td>${escapeHtml(row.browser)}</td><td>${row.count}</td></tr>`,
    );

    const apiErrors = (data.apiErrorsByRoute || []).map((row) =>
      `<tr><td>${escapeHtml(row.route)}</td><td>${row.errors}</td><td>${row.requests}</td></tr>`,
    );

    const apiLatency = (data.apiLatencyByRoute || []).map((row) =>
      `<tr><td>${escapeHtml(row.route)}</td><td>${row.requests}</td><td>${row.errors || 0}</td><td>${row.avg_ms ?? '—'}ms</td></tr>`,
    );

    const security = (data.securityEventsByDay || []).map((row) => {
      const day = row.day ? new Date(row.day).toLocaleDateString() : '';
      return `<tr><td>${escapeHtml(day)}</td><td>${row.count}</td></tr>`;
    });

    const recent = (data.recentEvents || []).map((row) => {
      const at = row.event_at ? new Date(row.event_at).toLocaleString() : '';
      return `<tr>
        <td>${escapeHtml(at)}</td>
        <td>${escapeHtml(row.kind)}</td>
        <td>${escapeHtml(row.code)}</td>
        <td>${escapeHtml(row.source)}</td>
        <td>${escapeHtml(row.extension_version)}</td>
        <td>${escapeHtml(row.message)}</td>
      </tr>`;
    });

    const alerts = (data.recentAlerts || []).map((row) => {
      const at = row.alerted_at ? new Date(row.alerted_at).toLocaleString() : '';
      return `<tr>
        <td>${escapeHtml(at)}</td>
        <td>${escapeHtml(row.severity)}</td>
        <td>${escapeHtml(row.title)}</td>
        <td>${row.delivered ? 'yes' : 'no'}</td>
      </tr>`;
    });

    container.innerHTML = `
      <p class="hint-inline">Window: last ${data.windowDays} days · Auto-refresh every 60s while this tab is open.</p>
      <div class="ops-grid">
        <div class="ops-stat ${statClass(avail.availability_pct)}"><strong>${escapeHtml(pct)}</strong><span>API+DB availability</span></div>
        <div class="ops-stat"><strong>${avail.healthy ?? 0}/${avail.samples ?? 0}</strong><span>Healthy health samples</span></div>
        <div class="ops-stat"><strong>${org.org_count ?? 0}</strong><span>Organizations</span></div>
        <div class="ops-stat"><strong>${org.active_members ?? 0}</strong><span>Active members</span></div>
        <div class="ops-stat"><strong>${org.active_devices ?? 0}</strong><span>Active devices</span></div>
      </div>

      <h2 class="section-gap">Synthetic checks (portal + API)</h2>
      ${renderTable(['Target', 'Status', 'HTTP', 'Latency', 'Checked', 'Message'], synthetic, 6)}

      <h2 class="section-gap">Recent alerts</h2>
      ${renderTable(['Time', 'Severity', 'Title', 'Webhook sent'], alerts, 4)}

      <h2 class="section-gap">API health samples</h2>
      <p class="hint-inline">“Process uptime” is the Node process age when sampled — use availability % for SLA.</p>
      ${renderTable(['Checked', 'Status', 'Version', 'Process uptime'], health, 4)}

      <h2 class="section-gap">API traffic (5xx by route)</h2>
      ${renderTable(['Route', '5xx', 'Requests'], apiErrors, 3)}

      <h2 class="section-gap">API traffic (volume &amp; avg latency)</h2>
      ${renderTable(['Route', 'Requests', '5xx', 'Avg ms'], apiLatency, 4)}

      <h2 class="section-gap">Extension telemetry by version</h2>
      ${renderTable(['Version', 'Browser', 'Events'], versions, 3)}

      <h2 class="section-gap">Client ops events by kind</h2>
      ${renderTable(['Kind', 'Count'], kinds, 2)}

      <h2 class="section-gap">Org security events by day</h2>
      ${renderTable(['Day', 'Events'], security, 2)}

      <h2 class="section-gap">Recent ops events</h2>
      ${renderTable(['Time', 'Kind', 'Code', 'Source', 'Extension', 'Message'], recent, 6)}
    `;
  }

  async function loadSummary(statusEl, summaryEl, daysInput) {
    if (statusEl) statusEl.textContent = 'Loading…';
    try {
      const data = await fetchSummary(Number(daysInput?.value) || 7);
      renderSummary(summaryEl, data);
      if (statusEl) statusEl.textContent = `Updated ${new Date().toLocaleTimeString()}.`;
    } catch (error) {
      if (statusEl) statusEl.textContent = error.message || 'Could not load summary.';
      summaryEl.innerHTML = '';
    }
  }

  function init() {
    const form = document.getElementById('ops-form');
    const tokenInput = document.getElementById('ops-token');
    const daysInput = document.getElementById('ops-days');
    const statusEl = document.getElementById('ops-status');
    const summaryEl = document.getElementById('ops-summary');
    const refreshBtn = document.getElementById('ops-refresh');
    if (!form || !summaryEl) return;

    if (tokenInput && token()) tokenInput.value = token();

    const run = async () => {
      setToken(tokenInput?.value?.trim() || '');
      await loadSummary(statusEl, summaryEl, daysInput);
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      run();
    });
    refreshBtn?.addEventListener('click', () => run());

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (token()) run();
    }, 60_000);
  }

  global.GoldspireOpsDashboard = { init, fetchSummary };
})(typeof window !== 'undefined' ? window : globalThis);
