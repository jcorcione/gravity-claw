document.addEventListener('DOMContentLoaded', () => {
    const authGate = document.getElementById('admin-auth-gate');
    const adminLayout = document.querySelector('.admin-layout');
    const loginBtn = document.getElementById('admin-login-btn');
    const emailInput = document.getElementById('admin-email');
    const passwordInput = document.getElementById('admin-password');
    const errorMsg = document.getElementById('auth-error');

    // Check if already logged in via session storage
    if (sessionStorage.getItem('adminToken')) {
        showDashboard();
        fetchSystemStatus();
    }

    loginBtn.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            errorMsg.textContent = 'Please enter both email and password';
            return;
        }

        try {
            const btnOriginalText = loginBtn.textContent;
            loginBtn.textContent = 'AUTHORIZING...';
            loginBtn.disabled = true;

            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (data.success) {
                // Here we store a marker in session storage so we don't have to keep logging in.
                sessionStorage.setItem('adminToken', data.userId);

                // Fetch the status. If it fails due to auth, we know the user is not an admin.
                const statusRes = await fetch('/api/admin/status', {
                    headers: { 'Authorization': `Bearer ${data.userId}` }
                });

                if (statusRes.ok) {
                    showDashboard();
                    updateStatusCards(await statusRes.json());
                } else {
                    errorMsg.textContent = 'User authorized, but is not an Admin.';
                    sessionStorage.removeItem('adminToken');
                }
            } else {
                errorMsg.textContent = data.error || 'Authentication Failed';
            }
        } catch (e) {
            errorMsg.textContent = 'Network error during authorization.';
        } finally {
            loginBtn.textContent = 'AUTHORIZE';
            loginBtn.disabled = false;
        }
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('adminToken');
        adminLayout.style.display = 'none';
        authGate.classList.add('active');
        emailInput.value = '';
        passwordInput.value = '';
        errorMsg.textContent = '';
    });

    // Navigation
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.content-view');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            navItems.forEach(n => n.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));

            item.classList.add('active');
            const target = item.getAttribute('data-target');
            document.getElementById(`view-${target}`).classList.add('active');

            if (target === 'dashboard') {
                fetchSystemStatus();
            }
        });
    });

    // Chat UI Navigation
    const handleChatNav = (e) => {
        e.preventDefault();
        const token = sessionStorage.getItem('adminToken');
        if (token) {
            localStorage.setItem('gravity_userId', token);
        }
        window.location.href = 'index.html';
    };

    document.getElementById('nav-chat')?.addEventListener('click', handleChatNav);
    document.getElementById('dashboard-chat-btn')?.addEventListener('click', handleChatNav);

    // Action Buttons
    document.getElementById('run-scan-btn').addEventListener('click', async () => {
        const btn = document.getElementById('run-scan-btn');
        const results = document.getElementById('scan-results');

        btn.disabled = true;
        btn.textContent = 'Scanning...';
        results.style.display = 'block';
        results.innerHTML = '<div class="loader"></div> <br>Initializing Gmail and Scanner APIs...';

        try {
            const token = sessionStorage.getItem('adminToken');
            const res = await fetch('/api/admin/campaigns', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ action: 'run_scan' })
            });

            const data = await res.json();
            if (res.ok) {
                results.innerHTML = `<strong>Scan Complete</strong>\n\n${data.message || data.reply || JSON.stringify(data, null, 2)}`;
            } else {
                results.innerHTML = `<span style="color:var(--error)">Error: ${data.error || 'Failed to complete scan'}</span>`;
            }
        } catch (e) {
            results.innerHTML = `<span style="color:var(--error)">Network Error: ${e.message}</span>`;
        } finally {
            btn.disabled = false;
            btn.textContent = 'Run Scan Now';
        }
    });

    document.getElementById('run-briefing-btn').addEventListener('click', async () => {
        triggerTask('run-briefing-btn', 'briefing');
    });

    document.getElementById('run-recommend-btn').addEventListener('click', async () => {
        triggerTask('run-recommend-btn', 'recommendations');
    });

    // Helpers
    function showDashboard() {
        authGate.classList.remove('active');
        adminLayout.style.display = 'flex';
    }

    async function fetchSystemStatus() {
        try {
            const token = sessionStorage.getItem('adminToken');
            if (!token) return;

            const res = await fetch('/api/admin/status', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                updateStatusCards(data);
            }
        } catch (e) {
            console.error("Failed to fetch status", e);
        }
    }

    function updateStatusCards(data) {
        document.getElementById('stat-users').textContent = data.users || '0';
        document.getElementById('stat-db').textContent = data.dbSizeMB ? data.dbSizeMB + ' MB' : '-- MB';
        document.getElementById('stat-vectors').textContent = data.vectors || '0';
        document.getElementById('stat-schedules').textContent = data.schedules || '0';
    }

    async function triggerTask(btnId, type) {
        const btn = document.getElementById(btnId);
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Running...';

        try {
            const token = sessionStorage.getItem('adminToken');
            const res = await fetch('/api/admin/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ action: type })
            });

            const data = await res.json();
            if (res.ok) {
                alert(`Task '${type}' triggered successfully. Check Telegram for results.`);
            } else {
                alert(`Error: ${data.error || 'Failed to trigger task'}`);
            }
        } catch (e) {
            alert(`Network Error: ${e.message}`);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
});
