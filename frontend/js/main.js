document.getElementById('year').textContent = new Date().getFullYear();

document.getElementById('hamburgerBtn')?.addEventListener('click', () => {
  document.getElementById('navLinks').classList.toggle('open');
});

async function loadSettings() {
  try {
    const { settings } = await api('/settings', { auth: false });
    if (settings.tagline) document.getElementById('tagline').textContent = settings.tagline;
    if (settings.description) document.getElementById('description').textContent = settings.description;
    if (settings.history) document.getElementById('history').textContent = settings.history;

    const socialWrap = document.getElementById('socialLinks');
    const socials = [
      ['Facebook', settings.facebook_url],
      ['Twitter / X', settings.twitter_url],
      ['Instagram', settings.instagram_url],
      ['TikTok', settings.tiktok_url],
      ['WhatsApp', settings.whatsapp_number ? `https://wa.me/${settings.whatsapp_number.replace('+', '')}` : null],
    ].filter(([, url]) => url);
    socialWrap.innerHTML = socials.length
      ? socials.map(([label, url]) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`).join('')
      : '<p style="color:var(--text-muted)">Social links coming soon.</p>';

    const devCredit = document.getElementById('devCredit');
    if (settings.developer_name) {
      devCredit.innerHTML = `Site developed by <a href="${settings.developer_website || '#'}" target="_blank">${settings.developer_name}</a>${settings.developer_email ? ` &middot; <a href="mailto:${settings.developer_email}">${settings.developer_email}</a>` : ''}`;
    }

    if (settings.theme_primary) {
      document.documentElement.style.setProperty('--bg-secondary', settings.theme_primary);
    }
    if (settings.theme_accent) {
      document.documentElement.style.setProperty('--accent', settings.theme_accent);
    }
  } catch (err) {
    console.error('Failed to load settings', err);
  }
}

async function loadGallery() {
  try {
    const { photos } = await api('/photos?category=gallery', { auth: false });
    const grid = document.getElementById('galleryGrid');
    if (!photos.length) {
      grid.innerHTML = '<p class="loading-text">No photos uploaded yet. Check back soon.</p>';
      return;
    }
    grid.innerHTML = photos
      .map((p) => `<img src="${resolveUploadUrl(p.url)}" alt="${p.caption || 'Autumn Gents Suites'}" loading="lazy" />`)
      .join('');
  } catch (err) {
    document.getElementById('galleryGrid').innerHTML = '<p class="loading-text">Could not load photos.</p>';
  }
}

async function loadRooms() {
  try {
    const { rooms } = await api('/rooms', { auth: false });
    const grid = document.getElementById('pricingGrid');
    if (!rooms.length) {
      grid.innerHTML = '<p class="loading-text">Room pricing coming soon.</p>';
      return;
    }
    grid.innerHTML = rooms
      .map(
        (r) => `
      <div class="card price-card">
        <span class="badge">${r.room_type}</span>
        <h3 style="margin-top:10px;">Room ${r.room_number}</h3>
        <div class="price">${formatMoney(r.price_monthly, r.price_currency)}<span>/month</span></div>
        <p style="color:var(--text-muted); font-size:0.88rem;">Sleeps ${r.capacity} &middot; <span class="status-pill status-${r.status}">${r.status}</span></p>
        ${r.description ? `<p style="margin-top:10px; font-size:0.88rem; color:var(--text-muted);">${r.description}</p>` : ''}
      </div>`
      )
      .join('');
  } catch (err) {
    document.getElementById('pricingGrid').innerHTML = '<p class="loading-text">Could not load rooms.</p>';
  }
}

async function loadRules() {
  try {
    const { rules } = await api('/rules', { auth: false });
    const wrap = document.getElementById('rulesList');
    wrap.innerHTML = rules.length
      ? rules.map((r) => `<div class="rule-item"><h4>${r.title}</h4><p>${r.content}</p></div>`).join('')
      : '<p class="loading-text">No rules published yet.</p>';
  } catch (err) {
    document.getElementById('rulesList').innerHTML = '<p class="loading-text">Could not load rules.</p>';
  }
}

async function loadUpdates() {
  try {
    const { updates } = await api('/updates', { auth: false });
    const wrap = document.getElementById('updatesList');
    wrap.innerHTML = updates.length
      ? updates
          .slice(0, 8)
          .map(
            (u) => `<div class="update-item"><h4>${u.pinned ? '📌 ' : ''}${u.title}</h4><p style="color:var(--text-muted)">${u.content}</p><div class="meta">${timeAgo(u.created_at)}</div></div>`
          )
          .join('')
      : '<p class="loading-text">No updates posted yet.</p>';
  } catch (err) {
    document.getElementById('updatesList').innerHTML = '<p class="loading-text">Could not load updates.</p>';
  }
}

async function loadLocations() {
  try {
    const { locations } = await api('/locations', { auth: false });
    const grid = document.getElementById('locationsGrid');
    grid.innerHTML = locations.length
      ? locations
          .map(
            (l) => `
        <div class="card">
          <h3>${l.name}</h3>
          <p style="color:var(--text-muted); margin: 8px 0;">${l.address}, ${l.city || ''} ${l.country || ''}</p>
          ${l.description ? `<p style="font-size:0.88rem; color:var(--text-muted);">${l.description}</p>` : ''}
          ${l.latitude && l.longitude ? `<a href="https://maps.google.com/?q=${l.latitude},${l.longitude}" target="_blank" class="btn btn-outline btn-sm" style="margin-top:12px;">Open in Maps</a>` : ''}
        </div>`
          )
          .join('')
      : '<p class="loading-text">No locations published yet.</p>';
  } catch (err) {
    document.getElementById('locationsGrid').innerHTML = '<p class="loading-text">Could not load locations.</p>';
  }
}

function resolveUploadUrl(url) {
  if (url.startsWith('http')) return url;
  const backendOrigin = API_BASE.replace('/api', '');
  return `${backendOrigin}${url}`;
}

loadSettings();
loadGallery();
loadRooms();
loadRules();
loadUpdates();
loadLocations();
