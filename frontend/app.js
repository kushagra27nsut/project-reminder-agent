/* =====================================================================
   RemindAI Agent — app.js
   Multi-tenant auth, per-user workspace isolation, admin analytics,
   3D Quantum AI background, full project/subscriber/log management
   ===================================================================== */

const API = '/api';
const ADMIN_EMAIL = 'kushagra.sharma.ug25@nsut.ac.in'; // Only this account sees admin analytics
let currentUser = null; // { name, email, id }

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */
function getAuthHeaders(includeToken = true) {
  if (includeToken && currentUser && currentUser.sessionToken) {
    return { 'Content-Type': 'application/json', 'x-auth-token': currentUser.sessionToken };
  }
  return { 'Content-Type': 'application/json' };
}

function showToast(message, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.style.borderColor = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#00f2fe';
  t.style.boxShadow = `0 10px 30px ${type === 'error' ? 'rgba(239,68,68,0.3)' : type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(0,242,254,0.3)'}`;
  t.classList.add('active');
  setTimeout(() => t.classList.remove('active'), 3800);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(dateStr) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function urgencyClass(days) {
  if (days < 0) return 'overdue';
  if (days <= 5) return 'critical';
  if (days <= 15) return 'warning';
  return 'safe';
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ─────────────────────────────────────────────
   3D WebGL Quantum AI Background (Three.js)
───────────────────────────────────────────── */
function initThreeJS() {
  const canvas = document.getElementById('bg-3d-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 22);

  // ── Particle field ──────────────────────────────────
  const particleCount = 2200;
  const positions = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  const pColors = new Float32Array(particleCount * 3);
  const palette = [
    new THREE.Color('#00f2fe'), new THREE.Color('#6366f1'),
    new THREE.Color('#9d4edd'), new THREE.Color('#f72585'),
    new THREE.Color('#4facfe')
  ];
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 90;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 90;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 90;
    sizes[i] = Math.random() * 2.2 + 0.4;
    const c = palette[Math.floor(Math.random() * palette.length)];
    pColors[i * 3] = c.r; pColors[i * 3 + 1] = c.g; pColors[i * 3 + 2] = c.b;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
  const particleMat = new THREE.PointsMaterial({
    size: 0.18, vertexColors: true, transparent: true, opacity: 0.75, sizeAttenuation: true
  });
  scene.add(new THREE.Points(particleGeo, particleMat));

  // ── Central wireframe icosahedron ───────────────────
  const coreGeo = new THREE.IcosahedronGeometry(4.5, 1);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x6366f1, wireframe: true, transparent: true, opacity: 0.28 });
  const core = new THREE.Mesh(coreGeo, coreMat);
  scene.add(core);

  // ── Outer dodecahedron wireframe ─────────────────────
  const outerGeo = new THREE.DodecahedronGeometry(7.5, 0);
  const outerMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, wireframe: true, transparent: true, opacity: 0.12 });
  const outerMesh = new THREE.Mesh(outerGeo, outerMat);
  scene.add(outerMesh);

  // ── Glowing inner sphere ──────────────────────────────
  const sphereGeo = new THREE.SphereGeometry(2.4, 32, 32);
  const sphereMat = new THREE.MeshBasicMaterial({ color: 0x9d4edd, transparent: true, opacity: 0.08 });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  scene.add(sphere);

  // ── Torus rings ───────────────────────────────────────
  const rings = [];
  [[9, 0.05, 0x00f2fe, 0.1], [12, 0.04, 0x6366f1, 0.08], [15, 0.03, 0x9d4edd, 0.06]].forEach(([r, t, c, o]) => {
    const geo = new THREE.TorusGeometry(r, t, 12, 90);
    const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.random() * Math.PI;
    mesh.rotation.y = Math.random() * Math.PI;
    rings.push(mesh);
    scene.add(mesh);
  });

  // ── Neural network connection lines ───────────────────
  const nodeCount = 18;
  const nodePositions = [];
  for (let i = 0; i < nodeCount; i++) {
    const theta = (i / nodeCount) * Math.PI * 2;
    const r = 8 + Math.random() * 4;
    nodePositions.push(new THREE.Vector3(Math.cos(theta) * r, (Math.random() - 0.5) * 6, Math.sin(theta) * r));
  }
  const lineGroup = new THREE.Group();
  for (let i = 0; i < nodeCount; i++) {
    for (let j = i + 1; j < nodeCount; j++) {
      if (nodePositions[i].distanceTo(nodePositions[j]) < 10) {
        const lg = new THREE.BufferGeometry().setFromPoints([nodePositions[i], nodePositions[j]]);
        const lm = new THREE.LineBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.12 });
        lineGroup.add(new THREE.Line(lg, lm));
      }
    }
  }
  scene.add(lineGroup);

  // ── Mouse parallax ────────────────────────────────────
  let mx = 0, my = 0;
  document.addEventListener('mousemove', e => {
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  // ── Resize handler ────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── Render loop ───────────────────────────────────────
  let t2 = 0;
  function animate() {
    requestAnimationFrame(animate);
    t2 += 0.005;
    core.rotation.x = t2 * 0.4; core.rotation.y = t2 * 0.6;
    outerMesh.rotation.x = -t2 * 0.2; outerMesh.rotation.y = -t2 * 0.3;
    sphere.rotation.y = t2 * 0.8;
    rings.forEach((r, i) => { r.rotation.x += 0.003 + i * 0.001; r.rotation.z += 0.002; });
    lineGroup.rotation.y = t2 * 0.15;
    camera.position.x += (mx * 3 - camera.position.x) * 0.04;
    camera.position.y += (-my * 3 - camera.position.y) * 0.04;
    camera.lookAt(scene.position);
    renderer.render(scene, camera);
  }
  animate();
}

/* ─────────────────────────────────────────────
   Navigation (Tab Switching)
───────────────────────────────────────────── */
function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const tab = link.dataset.tab;
      switchTab(tab);
    });
  });
  document.querySelectorAll('[data-tab-nav]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tabNav));
  });
}

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const section = document.getElementById(`tab-${tab}`);
  if (section) section.classList.add('active');
  const navLink = document.querySelector(`.nav-item[data-tab="${tab}"]`);
  if (navLink) navLink.classList.add('active');
  if (tab === 'logs') loadLogs();
  if (tab === 'team') loadSubscribers();
  if (tab === 'settings') loadSettings(), loadAdminStats();
  if (tab === 'timeline') loadProjects();
  if (tab === 'dashboard') loadDashboard();
}

/* ─────────────────────────────────────────────
   Auth Portal (Login / Register)
───────────────────────────────────────────── */
function openLoginPortal() {
  refreshSavedAccountUI();
  document.getElementById('login-portal').classList.remove('hidden');
}
function closeLoginPortal() {
  document.getElementById('login-portal').classList.add('hidden');
}

function getSavedUser() {
  try {
    const saved = localStorage.getItem('remindai_user');
    return saved ? JSON.parse(saved) : null;
  } catch {
    localStorage.removeItem('remindai_user');
    return null;
  }
}

function refreshSavedAccountUI() {
  const saved = getSavedUser();
  const savedBox = document.getElementById('saved-account-box');
  const googleBox = document.getElementById('google-saved-account');
  const boxes = [savedBox, googleBox].filter(Boolean);
  if (!saved || !saved.email) {
    boxes.forEach(box => box.classList.add('hidden'));
    return;
  }

  boxes.forEach(box => box.classList.remove('hidden'));
  const nameTargets = ['saved-account-name', 'google-saved-name'];
  const emailTargets = ['saved-account-email', 'google-saved-email'];
  nameTargets.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = saved.name || saved.email; });
  emailTargets.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = saved.email; });
}

async function continueWithSavedUser() {
  const saved = getSavedUser();
  if (!saved || !saved.email) {
    showToast('No saved account found. Please sign in once.', 'info');
    return;
  }
  try {
    const res = await fetch(`${API}/auth/session`, {
      headers: getAuthHeaders() // Use the new auth headers with token
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Saved session is not available');
    onLoginSuccess(data.user); // The user object from session includes the token
    document.getElementById('google-sso-modal').classList.remove('active');
    closeLoginPortal();
    showToast(`Welcome back, ${data.user.name}!`, 'success');
  } catch (err) {
    localStorage.removeItem('remindai_user');
    refreshSavedAccountUI();
    showToast(`${err.message}. Please sign in again.`, 'error');
  }
}

function initAuthPortal() {
  // Open portal from profile pill
  document.getElementById('user-profile-pill').addEventListener('click', openLoginPortal);
  // Open portal from settings button
  const btnTLP = document.getElementById('btnTriggerLoginPortal');
  if (btnTLP) btnTLP.addEventListener('click', openLoginPortal);
  // Close button
  document.getElementById('btnCloseLoginPortal').addEventListener('click', closeLoginPortal);
  // Close when clicking outside the card
  document.getElementById('login-portal').addEventListener('click', e => {
    if (e.target === document.getElementById('login-portal')) closeLoginPortal();
  });

  // Tab switching (Sign In / Register)
  document.getElementById('btnTabLogin').addEventListener('click', () => {
    document.getElementById('btnTabLogin').classList.add('active');
    document.getElementById('btnTabRegister').classList.remove('active');
    document.getElementById('auth-login-form').classList.remove('hidden');
    document.getElementById('auth-register-form').classList.add('hidden');
    document.getElementById('auth-forgot-form').classList.add('hidden');
  });
  document.getElementById('btnTabRegister').addEventListener('click', () => {
    document.getElementById('btnTabRegister').classList.add('active');
    document.getElementById('btnTabLogin').classList.remove('active');
    document.getElementById('auth-register-form').classList.remove('hidden');
    document.getElementById('auth-login-form').classList.add('hidden');
    document.getElementById('auth-forgot-form').classList.add('hidden');
  });

  document.getElementById('btnContinueSaved').addEventListener('click', continueWithSavedUser);
  document.getElementById('btnShowForgotPassword').addEventListener('click', () => {
    const saved = getSavedUser();
    document.getElementById('forgot-email').value = document.getElementById('login-email').value.trim() || (saved && saved.email) || '';
    document.getElementById('auth-login-form').classList.add('hidden');
    document.getElementById('auth-register-form').classList.add('hidden');
    document.getElementById('auth-forgot-form').classList.remove('hidden');
  });
  document.getElementById('btnBackToLogin').addEventListener('click', () => {
    document.getElementById('auth-forgot-form').classList.add('hidden');
    document.getElementById('auth-login-form').classList.remove('hidden');
    document.getElementById('btnTabLogin').classList.add('active');
    document.getElementById('btnTabRegister').classList.remove('active');
  });

  // Sign In form submit
  document.getElementById('auth-login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Signing in...';
    btn.disabled = true;
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST', headers: getAuthHeaders(false), // Don't send token for login
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      onLoginSuccess(data.user);
      closeLoginPortal();
      showToast(`✅ Welcome back, ${data.user.name}! Workspace restored.`, 'success');
    } catch (err) {
      showToast(`❌ ${err.message}`, 'error');
    } finally {
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In to Workspace';
      btn.disabled = false;
    }
  });

  document.getElementById('auth-forgot-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    const newPassword = document.getElementById('forgot-password').value;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Resetting...';
    btn.disabled = true;
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: 'POST', headers: getAuthHeaders(false), // Don't send token for forgot password
        body: JSON.stringify({ email, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Password reset failed');
      document.getElementById('login-email').value = email;
      document.getElementById('login-password').value = '';
      document.getElementById('forgot-password').value = '';
      document.getElementById('auth-forgot-form').classList.add('hidden');
      document.getElementById('auth-login-form').classList.remove('hidden');
      document.getElementById('btnTabLogin').classList.add('active');
      document.getElementById('btnTabRegister').classList.remove('active');
      showToast('Password reset. Sign in with the new password; your workspace data is unchanged.', 'success');
    } catch (err) {
      showToast(`${err.message}`, 'error');
    } finally {
      btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Reset Password';
      btn.disabled = false;
    }
  });

  // Register form submit
  document.getElementById('auth-register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Creating account...';
    btn.disabled = true;
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST', headers: getAuthHeaders(false), // Don't send token for register
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      onLoginSuccess(data.user);
      closeLoginPortal();
      showToast(`🎉 Account created! Welcome, ${data.user.name}!`, 'success');
    } catch (err) {
      showToast(`❌ ${err.message}`, 'error');
    } finally {
      btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Workspace Account';
      btn.disabled = false;
    }
  });

  // Google Sign-In button opens secondary modal
  document.getElementById('btnGoogleSignIn').addEventListener('click', () => {
    refreshSavedAccountUI();
    document.getElementById('google-sso-modal').classList.add('active');
  });
  document.getElementById('btnGoogleContinueSaved').addEventListener('click', continueWithSavedUser);

  // Google Account form submit
  document.getElementById('google-account-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('google-account-email').value.trim();
    const name = document.getElementById('google-account-name').value.trim();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Authorizing...';
    btn.disabled = true;
    try {
      const res = await fetch(`${API}/auth/google`, {
        method: 'POST', headers: getAuthHeaders(false), // Don't send token for Google auth
        body: JSON.stringify({ name, email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Google auth failed');
      document.getElementById('google-sso-modal').classList.remove('active');
      onLoginSuccess(data.user);
      closeLoginPortal();
      showToast(`✅ Signed in as ${data.user.name} via Google.`, 'success');
    } catch (err) {
      showToast(`❌ ${err.message}`, 'error');
    } finally {
      btn.innerHTML = '<i class="fa-brands fa-google"></i> Authorize & Sign In';
      btn.disabled = false;
    }
  });

  // Logout — calls API to mark session inactive, then resets to guest
  const doLogout = async () => {
    if (currentUser) {
      try {
        await fetch(`${API}/auth/logout`, { method: 'POST', headers: getAuthHeaders() }); // Send token to invalidate
      } catch {}
    }
    currentUser = null;
    localStorage.removeItem('remindai_user');
    updateProfilePill();
    loadDashboard();
    showToast('👋 Logged out successfully. Browsing as Guest.', 'info');
  };

  // Settings page logout button
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) btnLogout.addEventListener('click', doLogout);
}

/* ─────────────────────────────────────────────
   On Login Success — Update UI and Reload Data
───────────────────────────────────────────── */
function onLoginSuccess(user) { // User object now includes sessionToken
  currentUser = user;
  localStorage.setItem('remindai_user', JSON.stringify(user));
  updateProfilePill();
  // Refresh all data with new user context
  loadDashboard();
  loadProjects();
}

function updateProfilePill() {
  const nameEl = document.getElementById('user-pill-name');
  const avatarEl = document.getElementById('user-avatar');
  const greetEl = document.getElementById('user-greeting');
  const adminSection = document.getElementById('admin-only-section');
  const sessionName = document.getElementById('settings-session-name');
  const settingsLogout = document.getElementById('btnLogout');
  const settingsAvatar = document.getElementById('settings-user-avatar');
  const settingsTitle = document.getElementById('settings-account-title');
  const settingsEmail = document.getElementById('settings-account-email');

  if (currentUser) {
    nameEl.textContent = currentUser.name ? currentUser.name.split(' ')[0] : 'User';
    const avatarSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&background=6366f1&color=fff`;
    avatarEl.src = avatarSrc;
    if (settingsAvatar) settingsAvatar.src = avatarSrc;
    if (greetEl) greetEl.textContent = currentUser.name.split(' ')[0];
    if (sessionName) sessionName.textContent = `${currentUser.name} (${currentUser.email})`;
    if (settingsTitle) settingsTitle.textContent = currentUser.name;
    if (settingsEmail) settingsEmail.textContent = currentUser.email;
    if (document.getElementById('setting-user-name')) document.getElementById('setting-user-name').value = currentUser.name;
    if (document.getElementById('setting-user-email')) document.getElementById('setting-user-email').value = currentUser.email; // This will be read-only for Google users
    if (settingsLogout) settingsLogout.classList.remove('hidden');
    // Show admin panel ONLY for the host
    if (adminSection) adminSection.style.display = (currentUser.email.toLowerCase() === ADMIN_EMAIL) ? 'block' : 'none';
  } else {
    nameEl.textContent = 'Guest';
    avatarEl.src = 'https://ui-avatars.com/api/?name=Guest+User&background=00f2fe&color=fff';
    if (settingsAvatar) settingsAvatar.src = 'https://ui-avatars.com/api/?name=Guest+User&background=00f2fe&color=fff';
    if (greetEl) greetEl.textContent = 'Guest';
    if (sessionName) sessionName.textContent = 'Guest';
    if (settingsTitle) settingsTitle.textContent = 'Guest';
    if (settingsEmail) settingsEmail.textContent = 'Sign in to view and manage your workspace identity.';
    if (document.getElementById('setting-user-name')) document.getElementById('setting-user-name').value = '';
    if (document.getElementById('setting-user-email')) document.getElementById('setting-user-email').value = '';
    if (settingsLogout) settingsLogout.classList.add('hidden');
    // Always hide admin section for guests
    if (adminSection) adminSection.style.display = 'none';
  }
}

/* ─────────────────────────────────────────────
   Dashboard Data Loading
───────────────────────────────────────────── */
async function loadDashboard() {
  try {
    const [projectsRes, subsRes, logsRes] = await Promise.all([
      fetch(`${API}/projects`, { headers: getAuthHeaders() }),
      fetch(`${API}/subscribers`, { headers: getAuthHeaders() }),
      fetch(`${API}/reminders`, { headers: getAuthHeaders() })
    ]);
    const projects = await projectsRes.json();
    const subscribers = await subsRes.json();
    const logs = await logsRes.json();

    document.getElementById('metric-projects').textContent = Array.isArray(projects) ? projects.length : 0;
    document.getElementById('metric-subscribers').textContent = Array.isArray(subscribers) ? subscribers.filter(s => s.active).length : 0;
    document.getElementById('metric-reminders').textContent = Array.isArray(logs) ? logs.filter(l => l.status === 'success').length : 0;

    // Closest upcoming project countdown
    const upcoming = Array.isArray(projects)
      ? projects.filter(p => !p.completed && daysUntil(p.date) >= 0).sort((a, b) => daysUntil(a.date) - daysUntil(b.date))
      : [];
    const countdownEl = document.getElementById('metric-countdown');
    if (upcoming.length > 0) {
      const d = daysUntil(upcoming[0].date);
      countdownEl.textContent = d === 0 ? 'Today' : `${d}d`;
    } else {
      countdownEl.textContent = '—';
    }

    // Logs preview
    const logsList = document.getElementById('logs-preview-list');
    if (Array.isArray(logs) && logs.length > 0) {
      logsList.innerHTML = logs.slice(-5).reverse().map(log => `
        <div class="log-preview-item">
          <span class="log-dot ${log.status === 'success' ? 'dot-green' : 'dot-red'}"></span>
          <span class="log-text">${escapeHtml(log.projectName || '—')} → <strong>${escapeHtml(log.subscriberEmail || '—')}</strong></span>
          <span class="log-time">${formatDate(log.sentAt)}</span>
        </div>
      `).join('');
    } else {
      logsList.innerHTML = `<div class="empty-state"><i class="fa-regular fa-bell-slash"></i><p>No activity logs recorded yet in your workspace.</p></div>`;
    }
  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

/* ─────────────────────────────────────────────
   Projects (Timeline Tab)
───────────────────────────────────────────── */
async function loadProjects() {
  const listEl = document.getElementById('timeline-project-list');
  try {
    const res = await fetch(`${API}/projects`, { headers: getAuthHeaders() });
    const projects = await res.json();

    if (!Array.isArray(projects) || projects.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-calendar-xmark"></i><p>No workspace projects loaded. Upload an Excel sheet or click "New Project".</p></div>`;
      return;
    }

    // Sort: incomplete first, then by date
    projects.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(a.date) - new Date(b.date);
    });

    listEl.innerHTML = projects.map(p => {
      const days = daysUntil(p.date);
      const urg = urgencyClass(days);
      const urgColors = { overdue: '#ef4444', critical: '#f72585', warning: '#ffb703', safe: '#10b981' };
      const urgLabels = { overdue: 'Overdue', critical: 'Critical', warning: 'Warning', safe: 'On Track' };
      const teamHtml = (p.teamMembers && p.teamMembers.length > 0)
        ? p.teamMembers.map(m => `<span class="team-member-tag"><i class="fa-solid fa-user-tie"></i> ${escapeHtml(m.split('@')[0])}</span>`).join('')
        : '';
      return `
      <div class="project-card ${p.completed ? 'completed' : ''}" data-id="${p.id}">
        <div class="project-info-left">
          <label class="checkbox-container" title="${p.completed ? 'Mark Incomplete' : 'Mark Complete — stops all reminders'}">
            <input type="checkbox" ${p.completed ? 'checked' : ''} onchange="toggleProjectComplete('${p.id}', this)">
            <div class="custom-checkbox">${p.completed ? '<i class="fa-solid fa-check"></i>' : ''}</div>
          </label>
          <div class="project-details">
            <h3 class="project-name">${escapeHtml(p.name)}
              <span class="status-badge ${p.completed ? 'badge-completed' : 'badge-active'}">${p.completed ? '✅ Complete' : urgLabels[urg]}</span>
            </h3>
            <p class="project-desc">${escapeHtml(p.description || '—')}</p>
            <div class="project-meta">
              <span><i class="fa-regular fa-calendar"></i> ${formatDate(p.date)}</span>
              <span style="color:${urgColors[urg]}">
                <i class="fa-solid fa-hourglass-half"></i>
                ${p.completed ? 'Reminders paused' : (days < 0 ? `${Math.abs(days)}d overdue` : `${days} days remaining`)}
              </span>
              ${teamHtml}
            </div>
          </div>
        </div>
        <div class="project-actions">
          <button class="btn btn-text btn-sm" onclick="openInviteModal('${p.id}', '${escapeHtml(p.name)}')" title="Invite a team member">
            <i class="fa-solid fa-user-plus"></i>
          </button>
          <button class="btn btn-danger-outline btn-sm" onclick="deleteProject('${p.id}')" title="Remove project from reminders">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-exclamation-triangle"></i><p>Error loading projects. Is the server running?</p></div>`;
  }
}

async function toggleProjectComplete(id, cb) {
  try {
    const res = await fetch(`${API}/projects/${id}/toggle-complete`, {
      method: 'PATCH', headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const action = data.completed ? '✅ Marked complete — reminders paused.' : '🔔 Reminders resumed.';
    showToast(action, data.completed ? 'success' : 'info');
    loadProjects();
    loadDashboard();
  } catch (err) {
    showToast('❌ Could not update project.', 'error');
    cb.checked = !cb.checked;
  }
}

async function deleteProject(id) {
  if (!confirm('Remove this project? This will permanently stop all reminders for it.')) return;
  try {
    const res = await fetch(`${API}/projects/${id}`, {
      method: 'DELETE', headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Delete failed');
    showToast('🗑️ Project removed from reminders.', 'success');
    loadProjects();
    loadDashboard();
  } catch (err) {
    showToast('❌ Could not delete project.', 'error');
  }
}

function openInviteModal(id, name) {
  document.getElementById('invite-project-id').value = id;
  document.getElementById('invite-project-title-display').textContent = `Inviting member to: ${name}`;
  document.getElementById('invite-modal').classList.add('active');
}

/* ─────────────────────────────────────────────
   Subscribers (Team Tab)
───────────────────────────────────────────── */
async function loadSubscribers() {
  const listEl = document.getElementById('subscribers-list');
  try {
    const res = await fetch(`${API}/subscribers`, { headers: getAuthHeaders() });
    const subs = await res.json();
    if (!Array.isArray(subs) || subs.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-user-slash"></i><p>No subscribers added to this workspace yet.</p></div>`;
      return;
    }
    listEl.innerHTML = subs.map(s => `
      <div class="sub-item">
        <div class="sub-info">
          <h4><i class="fa-solid fa-user-circle" style="color:var(--cyan)"></i> ${escapeHtml(s.name)}</h4>
          <p>${escapeHtml(s.email)} ${s.phone ? `· ${escapeHtml(s.phone)}` : ''}</p>
        </div>
        <button class="btn btn-danger-outline btn-sm" onclick="removeSubscriber('${s.id}')">
          <i class="fa-solid fa-times"></i>
        </button>
      </div>
    `).join('');
  } catch {
    listEl.innerHTML = `<div class="empty-state"><p>Error loading subscribers.</p></div>`;
  }
}

async function removeSubscriber(id) {
  try {
    const res = await fetch(`${API}/subscribers/${id}`, {
      method: 'DELETE', headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to remove subscriber');
    showToast('Subscriber removed.', 'success');
    loadSubscribers();
    loadDashboard();
  } catch {
    showToast('❌ Could not remove subscriber.', 'error');
  }
}

function initSubscriberForm() {
  document.getElementById('add-subscriber-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('sub-name').value.trim();
    const email = document.getElementById('sub-email').value.trim();
    const phone = document.getElementById('sub-phone').value.trim();
    try {
      const res = await fetch(`${API}/subscribers`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ name, email, phone })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add subscriber');
      showToast(`✅ ${name} added to notification list.`, 'success');
      e.target.reset();
      loadSubscribers();
      loadDashboard();
    } catch (err) {
      showToast(`❌ ${err.message}`, 'error');
    }
  });
}

/* ─────────────────────────────────────────────
   Logs (Activity Log Tab)
───────────────────────────────────────────── */
async function loadLogs() {
  const tbody = document.getElementById('logs-table-body');
  try {
    const res = await fetch(`${API}/reminders`, { headers: getAuthHeaders() });
    const logs = await res.json();
    if (!Array.isArray(logs) || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:32px; color:var(--text-muted)">No reminder dispatches recorded yet in your workspace.</td></tr>`;
      return;
    }
    tbody.innerHTML = [...logs].reverse().map(log => `
      <tr>
        <td style="font-size:0.8rem; color:var(--text-muted)">${formatDate(log.sentAt)}</td>
        <td><strong>${escapeHtml(log.projectName || '—')}</strong></td>
        <td style="color:var(--cyan)">${escapeHtml(log.subscriberEmail || '—')}</td>
        <td><span class="status-badge badge-active">${escapeHtml(String(log.daysRemaining ?? '—'))}d</span></td>
        <td><span class="status-badge ${log.status === 'success' ? 'badge-completed' : ''}" style="${log.status !== 'success' ? 'background:rgba(239,68,68,0.15);color:#ef4444;border-color:rgba(239,68,68,0.3)' : ''}">${log.status || 'N/A'}</span></td>
        <td>${log.previewUrl ? `<a href="${log.previewUrl}" target="_blank" class="btn btn-text btn-sm"><i class="fa-solid fa-eye"></i> Preview</a>` : '—'}</td>
      </tr>
    `).join('');
  } catch {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">Error loading logs.</td></tr>`;
  }
}

/* ─────────────────────────────────────────────
   Settings & Admin Analytics
───────────────────────────────────────────── */
async function loadSettings() {
  updateProfilePill();
  try {
    const res = await fetch(`${API}/settings`, { headers: getAuthHeaders() });
    const data = await res.json();
    if (data.smtpUser) document.getElementById('setting-smtp-user').value = data.smtpUser;
    if (data.slackWebhook) document.getElementById('setting-slack-url').value = data.slackWebhook;
  } catch {}
}

async function loadAdminStats() {
  const listEl = document.getElementById('admin-user-list');
  if (!currentUser || currentUser.email.toLowerCase() !== ADMIN_EMAIL) {
    // Only show this message if the element exists and user is not admin
    if (listEl && currentUser) listEl.innerHTML = `<div class="empty-state"><p>Host sign-in required for user analytics.</p></div>`;
    return;
  }
  try {
    const res = await fetch(`${API}/admin/stats`, { headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not fetch user analytics.');
    document.getElementById('admin-total-users').textContent = data.totalUsers || 0;
    document.getElementById('admin-live-users').textContent = data.liveUsers || 0;

    if (data.users && data.users.length > 0) {
      listEl.innerHTML = `
        <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
          <thead>
            <tr style="color:var(--text-muted); text-align:left; border-bottom:1px solid var(--border-light);">
              <th style="padding:8px 12px;">Name</th>
              <th style="padding:8px 12px;">Email</th>
              <th style="padding:8px 12px;">Registered</th>
              <th style="padding:8px 12px;">Last Sign-in</th>
            </tr>
          </thead>
          <tbody>
            ${data.users.map(u => `
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:8px 12px; color:var(--text-primary)"><i class="fa-solid fa-circle-user" style="color:var(--cyan)"></i> ${escapeHtml(u.name)}</td>
                <td style="padding:8px 12px; color:var(--text-secondary)">${escapeHtml(u.email)}</td>
                <td style="padding:8px 12px; color:var(--text-muted)">${formatDate(u.createdAt)}</td>
                <td style="padding:8px 12px; color:var(--cyan)">${formatDate(u.lastLoginAt)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    } else {
      listEl.innerHTML = `<div class="empty-state"><p>No registered users yet.</p></div>`;
    }
  } catch {
    document.getElementById('admin-user-list').innerHTML = `<div class="empty-state"><p>Could not fetch user analytics.</p></div>`;
  }
}

function initSettingsForms() {
  document.getElementById('system-settings-form').addEventListener('submit', async e => {
    e.preventDefault();
    const smtpUser = document.getElementById('setting-smtp-user').value.trim();
    const slackWebhook = document.getElementById('setting-slack-url').value.trim();
    try {
      const res = await fetch(`${API}/settings`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ smtpUser, slackWebhook })
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('✅ Settings saved successfully.', 'success');
    } catch {
      showToast('❌ Failed to save settings.', 'error');
    }
  });

  document.getElementById('profile-settings-form').addEventListener('submit', async e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const name = document.getElementById('setting-user-name').value.trim();
    const email = document.getElementById('setting-user-email').value.trim();
    if (!currentUser) {
      showToast('Please sign in before updating your profile.', 'error');
      return;
    }
    try {
      const res = await fetch(`${API}/auth/profile`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ name, email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Profile update failed');
      onLoginSuccess(data.user);
      showToast('Profile updated and workspace preserved.', 'success');
    } catch (err) {
      showToast(`${err.message}`, 'error');
    }
  }, true);

  document.getElementById('change-password-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUser) {
      showToast('Please sign in before changing your password.', 'error');
      return;
    }
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
    btn.disabled = true;
    try {
      const res = await fetch(`${API}/auth/change-password`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Password change failed');
      e.target.reset();
      showToast('Password changed. Your saved projects stay in this account.', 'success');
    } catch (err) {
      showToast(`${err.message}`, 'error');
    } finally {
      btn.innerHTML = '<i class="fa-solid fa-lock"></i> Change Password';
      btn.disabled = false;
    }
  });

}

/* ─────────────────────────────────────────────
   Add New Project Modal
───────────────────────────────────────────── */
function initProjectModal() {
  document.getElementById('btnOpenAddProjectModal').addEventListener('click', () => {
    document.getElementById('project-modal').classList.add('active');
  });

  document.getElementById('create-project-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('new-proj-name').value.trim();
    const date = document.getElementById('new-proj-date').value;
    const description = document.getElementById('new-proj-desc').value.trim();
    try {
      const res = await fetch(`${API}/projects`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ name, date, description })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create project');
      showToast(`✅ "${name}" added to your workspace.`, 'success');
      document.getElementById('project-modal').classList.remove('active');
      e.target.reset();
      loadProjects();
      loadDashboard();
    } catch (err) {
      showToast(`❌ ${err.message}`, 'error');
    }
  });
}

/* ─────────────────────────────────────────────
   Invite Team Member Modal
───────────────────────────────────────────── */
function initInviteModal() {
  document.getElementById('invite-team-form').addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('invite-project-id').value;
    const email = document.getElementById('invite-email').value.trim();
    try {
      const res = await fetch(`${API}/projects/${id}/invite`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invite failed');
      showToast(`✅ ${email} added to project team.`, 'success');
      document.getElementById('invite-modal').classList.remove('active');
      e.target.reset();
      loadProjects();
    } catch (err) {
      showToast(`❌ ${err.message}`, 'error');
    }
  });
}

/* ─────────────────────────────────────────────
   File Upload (Excel)
───────────────────────────────────────────── */
function initFileUpload() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) uploadFile(e.target.files[0]);
  });

  document.getElementById('download-template-link').addEventListener('click', e => {
    e.preventDefault();
    if (typeof XLSX === 'undefined') { showToast('XLSX library not loaded.', 'error'); return; }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Project Name', 'Deadline Date', 'Description'],
      ['Mobile App Launch', '2025-12-15', 'Deploy iOS & Android builds'],
      ['Backend API v2', '2026-01-20', 'REST API migration'],
      ['Marketing Campaign', '2026-02-01', 'Q1 campaign launch']
    ]);
    ws['!cols'] = [{ wch: 25 }, { wch: 16 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
    XLSX.writeFile(wb, 'RemindAI_Project_Template.xlsx');
    showToast('📥 Template downloaded!', 'success');
  });
}

async function uploadFile(file) {
  if (!file.name.endsWith('.xlsx')) {
    showToast('Please upload an .xlsx Excel file.', 'error');
    return;
  }
  const progressContainer = document.getElementById('upload-progress');
  progressContainer.style.display = 'block';
  const formData = new FormData();
  formData.append('file', file);
  const headers = {};
  if (currentUser && currentUser.sessionToken) {
    headers['x-auth-token'] = currentUser.sessionToken;
  }
  try {
    const res = await fetch(`${API}/upload`, { method: 'POST', headers, body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    showToast(`✅ ${data.count} projects imported into your workspace!`, 'success');
    loadProjects();
    loadDashboard();
    switchTab('timeline');
  } catch (err) {
    showToast(`❌ Upload error: ${err.message}`, 'error');
  } finally {
    progressContainer.style.display = 'none';
  }
}

/* ─────────────────────────────────────────────
   AI Chat Assistant
───────────────────────────────────────────── */
function initChat() {
  const sendBtn = document.getElementById('chat-send-btn');
  const inputField = document.getElementById('chat-input-field');

  const send = async () => {
    const msg = inputField.value.trim();
    if (!msg) return;
    appendMessage('user', msg);
    inputField.value = '';
    const typing = appendMessage('agent', '<i class="fa-solid fa-ellipsis fa-fade"></i>');
    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ message: msg })
      });
      const data = await res.json();
      typing.querySelector('.message-content').innerHTML = formatMarkdown(data.reply || 'No response.');
    } catch {
      typing.querySelector('.message-content').textContent = 'Sorry, I could not connect to the server.';
    }
  };

  sendBtn.addEventListener('click', send);
  inputField.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
}

function appendMessage(role, content) {
  const messagesEl = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `<div class="message-content">${content}</div>`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function formatMarkdown(text) {
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
}

/* ─────────────────────────────────────────────
   Cron Simulation Button
───────────────────────────────────────────── */
function initCronButton() {
  document.getElementById('btnSimulateCron').addEventListener('click', async () => {
    const btn = document.getElementById('btnSimulateCron');
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Scanning...';
    btn.disabled = true;
    try {
      const res = await fetch(`${API}/reminders/check`, { method: 'POST', headers: getAuthHeaders() });
      const data = await res.json();
      showToast(`✅ Cron scan complete! Sent: ${data.sentCount || 0} reminder(s).`, 'success');
      loadDashboard();
      loadLogs();
    } catch {
      showToast('❌ Cron scan failed. Is the server running?', 'error');
    } finally {
      btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Run Cron Scan';
      btn.disabled = false;
    }
  });
}

/* ─────────────────────────────────────────────
   Reset DB Button (Chat Tab)
───────────────────────────────────────────── */
function initResetDB() {
  document.getElementById('btnResetDB').addEventListener('click', async () => {
    if (!confirm('This will reset the GLOBAL database to initial state (affects all users). Continue?')) return;
    try {
      await fetch(`${API}/reset`, { method: 'POST' });
      showToast('🔄 Database reset. Guest mode restored.', 'info');
      currentUser = null;
      localStorage.removeItem('remindai_user');
      updateProfilePill();
      loadDashboard();
    } catch {
      showToast('❌ Reset failed.', 'error');
    }
  });
}

/* ─────────────────────────────────────────────
   Close Modals (all)
───────────────────────────────────────────── */
function initModals() {
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal').classList.remove('active');
    });
  });
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.classList.remove('active');
    });
  });
}

/* ─────────────────────────────────────────────
   Password Visibility Toggle
───────────────────────────────────────────── */
function initPasswordVisibilityToggle() {
  document.querySelectorAll('.toggle-password-visibility').forEach(button => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.target;
      const passwordInput = document.getElementById(targetId);
      const icon = button.querySelector('i');

      if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
      } else {
        passwordInput.type = 'password';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
      }
    });
  });
}

/* ─────────────────────────────────────────────
   Restore Session from LocalStorage on Load
───────────────────────────────────────────── */
function restoreSession() {
  const saved = localStorage.getItem('remindai_user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      updateProfilePill();
    } catch {
      localStorage.removeItem('remindai_user');
    }
  }
}

/* ─────────────────────────────────────────────
   Bootstrap — Initialize everything on DOMContentLoaded
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // injectExtraStyles(); // Removed, moved to styles.css
  restoreSession();
  initThreeJS();
  initNavigation();
  initAuthPortal();
  initModals();
  initProjectModal();
  initInviteModal();
  initSubscriberForm();
  initFileUpload();
  initChat();
  initCronButton();
  initResetDB();
  initSettingsForms();
  initPasswordVisibilityToggle(); // Add this call

  // Initial data load
  loadDashboard();
});
