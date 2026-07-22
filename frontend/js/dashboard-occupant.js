const user = Auth.requireRole('occupant');
if (user) document.getElementById('welcomeUser').textContent = `Signed in as ${user.fullName}`;

document.querySelectorAll('.sidebar .nav-item[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item[data-tab]').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    document.getElementById('pageTitle').textContent = btn.textContent.trim().replace(/^\S+\s/, '');
    loadTabData(btn.dataset.tab);
  });
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch (e) {}
  Auth.clearSession();
  window.location.href = 'login.html';
});

function loadTabData(tab) {
  const map = { overview: loadOverview, billing: loadBilling, rules: loadRules, updates: loadUpdates, tickets: loadTickets, profile: loadProfile };
  map[tab]?.();
}

// Overview
async function loadOverview() {
  try {
    const [{ user: me }, { payments }] = await Promise.all([api('/auth/me'), api('/billing/history')]);
    const lastPayment = payments.find((p) => p.status === 'completed');
    document.getElementById('statGrid').innerHTML = `
      <div class="stat-card"><div class="label">Account Status</div><div class="value" style="font-size:1.1rem;">${me.status}</div></div>
      <div class="stat-card"><div class="label">Room</div><div class="value" style="font-size:1.1rem;">${me.room_id ? 'Assigned' : 'Not yet assigned'}</div></div>
      <div class="stat-card"><div class="label">Last Payment</div><div class="value" style="font-size:1.1rem;">${lastPayment ? formatMoney(lastPayment.amount, lastPayment.currency) : 'None yet'}</div></div>
    `;
    const { updates } = await api('/updates', { auth: false });
    document.getElementById('updatesPreview').innerHTML = updates.slice(0, 5).map(
      (u) => `<p style="padding:8px 0; border-bottom:1px solid var(--border); font-size:0.88rem;"><strong>${u.title}</strong><br/><span style="color:var(--text-muted)">${u.content}</span></p>`
    ).join('') || '<p class="loading-text">No updates yet.</p>';
  } catch (err) { showToast(err.message, 'error'); }
}

// Billing
async function loadBilling() {
  try {
    const { payments } = await api('/billing/history');
    document.getElementById('paymentsTable').querySelector('tbody').innerHTML = payments.map((p) => `
      <tr>
        <td>${formatMoney(p.amount, p.currency)}</td>
        <td>${p.billing_period || '—'}</td>
        <td>${p.method}</td>
        <td><span class="status-pill status-${p.status}">${p.status}</span></td>
        <td>${new Date(p.created_at + 'Z').toLocaleDateString()}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="loading-text">No payments yet.</td></tr>';
  } catch (err) { showToast(err.message, 'error'); }
}
document.getElementById('payForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/billing/checkout', { method: 'POST', body: {
      amount: Number(document.getElementById('payAmount').value),
      billingPeriod: document.getElementById('payPeriod').value,
    }});
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
    } else {
      showToast(data.error || 'Payment recorded as pending. Online payments not yet configured by admin.', 'error');
    }
  } catch (err) { showToast(err.message, 'error'); }
});

// Rules
async function loadRules() {
  try {
    const { rules } = await api('/rules', { auth: false });
    document.getElementById('rulesList').innerHTML = rules.map((r) => `<div class="rule-item"><h4>${r.title}</h4><p>${r.content}</p></div>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
}

// Updates
async function loadUpdates() {
  try {
    const { updates } = await api('/updates', { auth: false });
    document.getElementById('updatesList').innerHTML = updates.map((u) => `<div class="update-item"><h4>${u.title}</h4><p style="color:var(--text-muted)">${u.content}</p><div class="meta">${timeAgo(u.created_at)}</div></div>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
}

// Tickets
async function loadTickets() {
  try {
    const { tickets } = await api('/tickets');
    document.getElementById('ticketsTable').querySelector('tbody').innerHTML = tickets.map((t) => `
      <tr><td>${t.title}</td><td>${t.priority}</td><td><span class="status-pill status-${t.status === 'resolved' ? 'active' : 'pending'}">${t.status}</span></td><td>${timeAgo(t.created_at)}</td></tr>`).join('') || '<tr><td colspan="4" class="loading-text">No requests yet.</td></tr>';
  } catch (err) { showToast(err.message, 'error'); }
}
document.getElementById('ticketForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/tickets', { method: 'POST', body: {
      title: document.getElementById('ticketTitle').value,
      description: document.getElementById('ticketDescription').value,
      priority: document.getElementById('ticketPriority').value,
    }});
    showToast('Request submitted.');
    e.target.reset();
    loadTickets();
  } catch (err) { showToast(err.message, 'error'); }
});

// Profile
async function loadProfile() {
  try {
    const { user: me } = await api('/auth/me');
    document.getElementById('p_fullName').value = me.full_name || '';
    document.getElementById('p_phone').value = me.phone || '';
  } catch (err) { showToast(err.message, 'error'); }
}
document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api(`/users/${user.id}`, { method: 'PATCH', body: {
      fullName: document.getElementById('p_fullName').value,
      phone: document.getElementById('p_phone').value,
      emergencyContact: document.getElementById('p_emergencyContact').value,
    }});
    showToast('Profile updated.');
  } catch (err) { showToast(err.message, 'error'); }
});

loadOverview();
