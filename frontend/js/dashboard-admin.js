const user = Auth.requireRole('admin');
if (user) document.getElementById('welcomeUser').textContent = `Signed in as ${user.fullName}`;

// ---------------- Tab switching ----------------
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
  const map = {
    overview: loadOverview,
    users: loadUsers,
    rooms: loadRoomsAdmin,
    photos: loadPhotosAdmin,
    rules: loadRulesAdmin,
    updates: loadUpdatesAdmin,
    locations: loadLocationsAdmin,
    billing: loadBilling,
    tickets: loadTickets,
    settings: loadSettingsAdmin,
    audit: loadAudit,
  };
  map[tab]?.();
}

// ---------------- Overview ----------------
async function loadOverview() {
  try {
    const [{ users }, { rooms }, { payments }] = await Promise.all([
      api('/users'), api('/rooms', { auth: false }), api('/billing/history'),
    ]);
    const occupants = users.filter((u) => u.role === 'occupant').length;
    const occupied = rooms.filter((r) => r.status === 'occupied').length;
    const totalRevenue = payments.filter((p) => p.status === 'completed').reduce((s, p) => s + p.amount, 0);

    document.getElementById('statGrid').innerHTML = `
      <div class="stat-card"><div class="label">Total Occupants</div><div class="value">${occupants}</div></div>
      <div class="stat-card"><div class="label">Rooms Occupied</div><div class="value">${occupied}/${rooms.length}</div></div>
      <div class="stat-card"><div class="label">Total Revenue</div><div class="value">${formatMoney(totalRevenue)}</div></div>
      <div class="stat-card"><div class="label">Staff Accounts</div><div class="value">${users.filter((u) => u.role !== 'occupant').length}</div></div>
    `;

    const { logs } = await api('/audit-logs');
    document.getElementById('recentActivity').innerHTML = logs.slice(0, 8).map(
      (l) => `<p style="padding:8px 0; border-bottom:1px solid var(--border); font-size:0.88rem;"><strong>${l.full_name || 'System'}</strong> — ${l.action.replace(/_/g, ' ').toLowerCase()} <span style="color:var(--text-muted); float:right;">${timeAgo(l.created_at)}</span></p>`
    ).join('');
  } catch (err) { showToast(err.message, 'error'); }
}

// ---------------- Users ----------------
async function loadUsers() {
  const role = document.getElementById('userRoleFilter').value;
  try {
    const { users } = await api(`/users${role ? `?role=${role}` : ''}`);
    const tbody = document.querySelector('#usersTable tbody');
    tbody.innerHTML = users.map((u) => `
      <tr>
        <td>${u.full_name}</td>
        <td>${u.email}</td>
        <td>${u.role}</td>
        <td>${u.room_id || '—'}</td>
        <td><span class="status-pill status-${u.status}">${u.status}</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="toggleSuspend('${u.id}', '${u.status}')">${u.status === 'suspended' ? 'Unsuspend' : 'Suspend'}</button>
          <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')">Delete</button>
        </td>
      </tr>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
}
document.getElementById('userRoleFilter').addEventListener('change', loadUsers);

async function toggleSuspend(id, currentStatus) {
  try {
    await api(`/users/${id}`, { method: 'PATCH', body: { status: currentStatus === 'suspended' ? 'active' : 'suspended' } });
    showToast('User status updated.');
    loadUsers();
  } catch (err) { showToast(err.message, 'error'); }
}
async function deleteUser(id) {
  if (!confirm('Delete this user permanently?')) return;
  try {
    await api(`/users/${id}`, { method: 'DELETE' });
    showToast('User deleted.');
    loadUsers();
  } catch (err) { showToast(err.message, 'error'); }
}

document.getElementById('addUserBtn').addEventListener('click', () => document.getElementById('userModalBackdrop').classList.add('open'));
document.getElementById('closeUserModal').addEventListener('click', () => document.getElementById('userModalBackdrop').classList.remove('open'));
document.getElementById('addUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/users', { method: 'POST', body: {
      fullName: document.getElementById('nu_fullName').value,
      email: document.getElementById('nu_email').value,
      password: document.getElementById('nu_password').value,
      role: document.getElementById('nu_role').value,
      phone: document.getElementById('nu_phone').value,
    }});
    showToast('User created.');
    document.getElementById('userModalBackdrop').classList.remove('open');
    e.target.reset();
    loadUsers();
  } catch (err) { showToast(err.message, 'error'); }
});

// ---------------- Rooms ----------------
async function loadRoomsAdmin() {
  try {
    const { rooms } = await api('/rooms', { auth: false });
    document.getElementById('roomsGrid').innerHTML = rooms.map((r) => `
      <div class="card">
        <span class="badge">${r.room_type}</span>
        <h3 style="margin-top:8px;">Room ${r.room_number}</h3>
        <p style="color:var(--accent); font-weight:700; font-size:1.3rem; margin:8px 0;">${formatMoney(r.price_monthly, r.price_currency)}<span style="font-size:0.8rem; color:var(--text-muted); font-weight:400;">/mo</span></p>
        <p style="font-size:0.85rem; color:var(--text-muted);">Capacity: ${r.capacity}</p>
        <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
          <select onchange="updateRoomStatus('${r.id}', this.value)" style="padding:6px; border-radius:6px; background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border); font-size:0.8rem;">
            <option ${r.status === 'available' ? 'selected' : ''} value="available">Available</option>
            <option ${r.status === 'occupied' ? 'selected' : ''} value="occupied">Occupied</option>
            <option ${r.status === 'maintenance' ? 'selected' : ''} value="maintenance">Maintenance</option>
            <option ${r.status === 'reserved' ? 'selected' : ''} value="reserved">Reserved</option>
          </select>
          <button class="btn btn-outline btn-sm" onclick="editRoomPrice('${r.id}', ${r.price_monthly})">Edit Price</button>
          <button class="btn btn-danger btn-sm" onclick="deleteRoom('${r.id}')">Delete</button>
        </div>
      </div>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
}
async function updateRoomStatus(id, status) {
  try { await api(`/rooms/${id}`, { method: 'PATCH', body: { status } }); showToast('Room updated.'); } catch (err) { showToast(err.message, 'error'); }
}
async function editRoomPrice(id, current) {
  const price = prompt('New monthly price:', current);
  if (price === null) return;
  try {
    await api(`/rooms/${id}`, { method: 'PATCH', body: { priceMonthly: Number(price) } });
    showToast('Price updated.');
    loadRoomsAdmin();
  } catch (err) { showToast(err.message, 'error'); }
}
async function deleteRoom(id) {
  if (!confirm('Delete this room?')) return;
  try { await api(`/rooms/${id}`, { method: 'DELETE' }); showToast('Room deleted.'); loadRoomsAdmin(); } catch (err) { showToast(err.message, 'error'); }
}

document.getElementById('addRoomBtn').addEventListener('click', () => document.getElementById('roomModalBackdrop').classList.add('open'));
document.getElementById('closeRoomModal').addEventListener('click', () => document.getElementById('roomModalBackdrop').classList.remove('open'));
document.getElementById('addRoomForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/rooms', { method: 'POST', body: {
      roomNumber: document.getElementById('nr_roomNumber').value,
      roomType: document.getElementById('nr_roomType').value,
      capacity: Number(document.getElementById('nr_capacity').value),
      priceMonthly: Number(document.getElementById('nr_price').value),
      description: document.getElementById('nr_description').value,
    }});
    showToast('Room created.');
    document.getElementById('roomModalBackdrop').classList.remove('open');
    e.target.reset();
    loadRoomsAdmin();
  } catch (err) { showToast(err.message, 'error'); }
});

// ---------------- Photos ----------------
async function loadPhotosAdmin() {
  try {
    const { photos } = await api('/photos', { auth: false });
    document.getElementById('adminGallery').innerHTML = photos.map((p) => `
      <div style="position:relative;">
        <img src="${resolveUploadUrl(p.url)}" alt="${p.caption || ''}" />
        <button class="btn btn-danger btn-sm" style="position:absolute; top:6px; right:6px;" onclick="deletePhoto('${p.id}')">✕</button>
      </div>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
}
async function deletePhoto(id) {
  if (!confirm('Delete this photo?')) return;
  try { await api(`/photos/${id}`, { method: 'DELETE' }); showToast('Photo deleted.'); loadPhotosAdmin(); } catch (err) { showToast(err.message, 'error'); }
}
document.getElementById('photoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData();
  fd.append('photo', document.getElementById('photoFile').files[0]);
  fd.append('category', document.getElementById('photoCategory').value);
  fd.append('caption', document.getElementById('photoCaption').value);
  try {
    await api('/photos', { method: 'POST', body: fd, isForm: true });
    showToast('Photo uploaded.');
    e.target.reset();
    loadPhotosAdmin();
  } catch (err) { showToast(err.message, 'error'); }
});
function resolveUploadUrl(url) {
  if (url.startsWith('http')) return url;
  return `${API_BASE.replace('/api', '')}${url}`;
}

// ---------------- Rules ----------------
async function loadRulesAdmin() {
  try {
    const { rules } = await api('/rules', { auth: false });
    document.getElementById('rulesAdminList').innerHTML = rules.map((r) => `
      <div class="card" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
        <div><h4>${r.title}</h4><p style="color:var(--text-muted); font-size:0.88rem;">${r.content}</p></div>
        <button class="btn btn-danger btn-sm" onclick="deleteRule('${r.id}')">Delete</button>
      </div>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
}
async function deleteRule(id) {
  if (!confirm('Remove this rule?')) return;
  try { await api(`/rules/${id}`, { method: 'DELETE' }); showToast('Rule removed.'); loadRulesAdmin(); } catch (err) { showToast(err.message, 'error'); }
}
document.getElementById('ruleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/rules', { method: 'POST', body: { title: document.getElementById('ruleTitle').value, content: document.getElementById('ruleContent').value } });
    showToast('Rule added.');
    e.target.reset();
    loadRulesAdmin();
  } catch (err) { showToast(err.message, 'error'); }
});

// ---------------- Updates ----------------
async function loadUpdatesAdmin() {
  try {
    const { updates } = await api('/updates', { auth: false });
    document.getElementById('updatesAdminList').innerHTML = updates.map((u) => `
      <div class="card" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
        <div><h4>${u.pinned ? '📌 ' : ''}${u.title}</h4><p style="color:var(--text-muted); font-size:0.88rem;">${u.content}</p></div>
        <button class="btn btn-danger btn-sm" onclick="deleteUpdate('${u.id}')">Delete</button>
      </div>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
}
async function deleteUpdate(id) {
  if (!confirm('Remove this update?')) return;
  try { await api(`/updates/${id}`, { method: 'DELETE' }); showToast('Update removed.'); loadUpdatesAdmin(); } catch (err) { showToast(err.message, 'error'); }
}
document.getElementById('updateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/updates', { method: 'POST', body: {
      title: document.getElementById('updateTitle').value,
      content: document.getElementById('updateContent').value,
      audience: document.getElementById('updateAudience').value,
      pinned: document.getElementById('updatePinned').value === '1',
    }});
    showToast('Update posted.');
    e.target.reset();
    loadUpdatesAdmin();
  } catch (err) { showToast(err.message, 'error'); }
});

// ---------------- Locations ----------------
async function loadLocationsAdmin() {
  try {
    const { locations } = await api('/locations', { auth: false });
    document.getElementById('locationsAdminGrid').innerHTML = locations.map((l) => `
      <div class="card">
        <h3>${l.name}</h3>
        <p style="color:var(--text-muted); margin:8px 0;">${l.address}, ${l.city || ''}</p>
        <button class="btn btn-danger btn-sm" onclick="deleteLocation('${l.id}')">Delete</button>
      </div>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
}
async function deleteLocation(id) {
  if (!confirm('Delete this location?')) return;
  try { await api(`/locations/${id}`, { method: 'DELETE' }); showToast('Location deleted.'); loadLocationsAdmin(); } catch (err) { showToast(err.message, 'error'); }
}
document.getElementById('locationForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/locations', { method: 'POST', body: {
      name: document.getElementById('locName').value,
      city: document.getElementById('locCity').value,
      address: document.getElementById('locAddress').value,
      latitude: document.getElementById('locLat').value ? Number(document.getElementById('locLat').value) : null,
      longitude: document.getElementById('locLng').value ? Number(document.getElementById('locLng').value) : null,
      description: document.getElementById('locDescription').value,
    }});
    showToast('Location added.');
    e.target.reset();
    loadLocationsAdmin();
  } catch (err) { showToast(err.message, 'error'); }
});

// ---------------- Billing ----------------
async function loadBilling() {
  try {
    const { payments } = await api('/billing/history');
    document.getElementById('paymentsTable').querySelector('tbody').innerHTML = payments.map((p) => `
      <tr>
        <td>${p.full_name}</td>
        <td>${formatMoney(p.amount, p.currency)}</td>
        <td>${p.method}</td>
        <td>${p.billing_period || '—'}</td>
        <td><span class="status-pill status-${p.status}">${p.status}</span></td>
        <td>${new Date(p.created_at + 'Z').toLocaleDateString()}</td>
      </tr>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
}
document.getElementById('manualPaymentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { users } = await api(`/users?role=occupant`);
    const occupant = users.find((u) => u.email === document.getElementById('mpEmail').value.trim());
    if (!occupant) return showToast('No occupant found with that email.', 'error');

    await api('/billing/manual', { method: 'POST', body: {
      userId: occupant.id,
      amount: Number(document.getElementById('mpAmount').value),
      method: document.getElementById('mpMethod').value,
      billingPeriod: document.getElementById('mpPeriod').value,
    }});
    showToast('Payment recorded.');
    e.target.reset();
    loadBilling();
  } catch (err) { showToast(err.message, 'error'); }
});

// ---------------- Tickets ----------------
async function loadTickets() {
  try {
    const { tickets } = await api('/tickets');
    document.getElementById('ticketsTable').querySelector('tbody').innerHTML = tickets.map((t) => `
      <tr>
        <td>${t.raised_by_name || '—'}</td>
        <td>${t.title}</td>
        <td>${t.priority}</td>
        <td><span class="status-pill status-${t.status === 'resolved' ? 'active' : 'pending'}">${t.status}</span></td>
        <td>
          <select onchange="updateTicket('${t.id}', this.value)" style="padding:6px; border-radius:6px; background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border); font-size:0.8rem;">
            <option ${t.status === 'open' ? 'selected' : ''} value="open">Open</option>
            <option ${t.status === 'in_progress' ? 'selected' : ''} value="in_progress">In Progress</option>
            <option ${t.status === 'resolved' ? 'selected' : ''} value="resolved">Resolved</option>
            <option ${t.status === 'closed' ? 'selected' : ''} value="closed">Closed</option>
          </select>
        </td>
      </tr>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
}
async function updateTicket(id, status) {
  try { await api(`/tickets/${id}`, { method: 'PATCH', body: { status } }); showToast('Ticket updated.'); } catch (err) { showToast(err.message, 'error'); }
}

// ---------------- Settings ----------------
async function loadSettingsAdmin() {
  try {
    const { settings } = await api('/settings', { auth: false });
    ['tagline', 'description', 'history', 'facebook_url', 'twitter_url', 'instagram_url', 'tiktok_url', 'whatsapp_number', 'developer_name', 'developer_email'].forEach((k) => {
      const el = document.getElementById(`s_${k}`);
      if (el && settings[k]) el.value = settings[k];
    });
    if (settings.theme_primary) document.getElementById('s_theme_primary').value = settings.theme_primary;
    if (settings.theme_accent) document.getElementById('s_theme_accent').value = settings.theme_accent;
  } catch (err) { showToast(err.message, 'error'); }
}
document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const keys = ['tagline', 'description', 'history', 'facebook_url', 'twitter_url', 'instagram_url', 'tiktok_url', 'whatsapp_number', 'developer_name', 'developer_email', 'theme_primary', 'theme_accent'];
  const body = {};
  keys.forEach((k) => { body[k] = document.getElementById(`s_${k}`).value; });
  try {
    await api('/settings', { method: 'PATCH', body });
    showToast('Settings saved.');
  } catch (err) { showToast(err.message, 'error'); }
});

// ---------------- Audit ----------------
async function loadAudit() {
  try {
    const { logs } = await api('/audit-logs');
    document.getElementById('auditTable').querySelector('tbody').innerHTML = logs.map((l) => `
      <tr>
        <td>${l.full_name || 'System'}</td>
        <td>${l.action.replace(/_/g, ' ')}</td>
        <td>${l.entity_type || '—'} ${l.entity_id ? `(${l.entity_id.slice(0, 8)})` : ''}</td>
        <td>${new Date(l.created_at + 'Z').toLocaleString()}</td>
      </tr>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
}

// Initial load
loadOverview();
