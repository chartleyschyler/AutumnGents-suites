const user = Auth.requireRole('tech');
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
  const map = { photos: loadPhotosAdmin, rooms: loadRoomsAdmin, rules: loadRulesAdmin, updates: loadUpdatesAdmin, tickets: loadTickets, settings: loadSettingsAdmin };
  map[tab]?.();
}

function resolveUploadUrl(url) {
  if (url.startsWith('http')) return url;
  return `${API_BASE.replace('/api', '')}${url}`;
}

// Photos
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

// Rooms (tech can update price/status but not create/delete)
async function loadRoomsAdmin() {
  try {
    const { rooms } = await api('/rooms', { auth: false });
    document.getElementById('roomsGrid').innerHTML = rooms.map((r) => `
      <div class="card">
        <span class="badge">${r.room_type}</span>
        <h3 style="margin-top:8px;">Room ${r.room_number}</h3>
        <p style="color:var(--accent); font-weight:700; font-size:1.3rem; margin:8px 0;">${formatMoney(r.price_monthly, r.price_currency)}<span style="font-size:0.8rem; color:var(--text-muted); font-weight:400;">/mo</span></p>
        <select onchange="updateRoomStatus('${r.id}', this.value)" style="padding:6px; border-radius:6px; background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border); font-size:0.8rem; margin-top:8px;">
          <option ${r.status === 'available' ? 'selected' : ''} value="available">Available</option>
          <option ${r.status === 'occupied' ? 'selected' : ''} value="occupied">Occupied</option>
          <option ${r.status === 'maintenance' ? 'selected' : ''} value="maintenance">Maintenance</option>
        </select>
        <button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="editRoomPrice('${r.id}', ${r.price_monthly})">Edit Price</button>
      </div>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
}
async function updateRoomStatus(id, status) {
  try { await api(`/rooms/${id}`, { method: 'PATCH', body: { status } }); showToast('Room updated.'); } catch (err) { showToast(err.message, 'error'); }
}
async function editRoomPrice(id, current) {
  const price = prompt('New monthly price:', current);
  if (price === null) return;
  try { await api(`/rooms/${id}`, { method: 'PATCH', body: { priceMonthly: Number(price) } }); showToast('Price updated.'); loadRoomsAdmin(); } catch (err) { showToast(err.message, 'error'); }
}

// Rules
async function loadRulesAdmin() {
  try {
    const { rules } = await api('/rules', { auth: false });
    document.getElementById('rulesAdminList').innerHTML = rules.map((r) => `
      <div class="card" style="margin-bottom:12px;"><h4>${r.title}</h4><p style="color:var(--text-muted); font-size:0.88rem;">${r.content}</p></div>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
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

// Updates
async function loadUpdatesAdmin() {
  try {
    const { updates } = await api('/updates', { auth: false });
    document.getElementById('updatesAdminList').innerHTML = updates.map((u) => `
      <div class="card" style="margin-bottom:12px;"><h4>${u.title}</h4><p style="color:var(--text-muted); font-size:0.88rem;">${u.content}</p></div>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
}
document.getElementById('updateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/updates', { method: 'POST', body: { title: document.getElementById('updateTitle').value, content: document.getElementById('updateContent').value, audience: 'all' } });
    showToast('Update posted.');
    e.target.reset();
    loadUpdatesAdmin();
  } catch (err) { showToast(err.message, 'error'); }
});

// Tickets
async function loadTickets() {
  try {
    const { tickets } = await api('/tickets');
    document.getElementById('ticketsTable').querySelector('tbody').innerHTML = tickets.map((t) => `
      <tr>
        <td>${t.raised_by_name || '—'}</td><td>${t.title}</td><td>${t.priority}</td>
        <td><span class="status-pill status-${t.status === 'resolved' ? 'active' : 'pending'}">${t.status}</span></td>
        <td>
          <select onchange="updateTicket('${t.id}', this.value)" style="padding:6px; border-radius:6px; background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border); font-size:0.8rem;">
            <option ${t.status === 'open' ? 'selected' : ''} value="open">Open</option>
            <option ${t.status === 'in_progress' ? 'selected' : ''} value="in_progress">In Progress</option>
            <option ${t.status === 'resolved' ? 'selected' : ''} value="resolved">Resolved</option>
          </select>
        </td>
      </tr>`).join('');
  } catch (err) { showToast(err.message, 'error'); }
}
async function updateTicket(id, status) {
  try { await api(`/tickets/${id}`, { method: 'PATCH', body: { status } }); showToast('Ticket updated.'); } catch (err) { showToast(err.message, 'error'); }
}

// Settings (theme + description only - tech can't touch financial/social settings)
async function loadSettingsAdmin() {
  try {
    const { settings } = await api('/settings', { auth: false });
    if (settings.tagline) document.getElementById('s_tagline').value = settings.tagline;
    if (settings.description) document.getElementById('s_description').value = settings.description;
    if (settings.theme_primary) document.getElementById('s_theme_primary').value = settings.theme_primary;
    if (settings.theme_accent) document.getElementById('s_theme_accent').value = settings.theme_accent;
  } catch (err) { showToast(err.message, 'error'); }
}
document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/settings', { method: 'PATCH', body: {
      tagline: document.getElementById('s_tagline').value,
      description: document.getElementById('s_description').value,
      theme_primary: document.getElementById('s_theme_primary').value,
      theme_accent: document.getElementById('s_theme_accent').value,
    }});
    showToast('Settings saved.');
  } catch (err) { showToast(err.message, 'error'); }
});

loadPhotosAdmin();
