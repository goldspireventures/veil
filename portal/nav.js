(function (global) {
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function membershipSummary(org) {
    const policy = org?.settings?.membershipPolicy || 'invite';
    const domains = org?.settings?.allowedEmailDomains || [];
    if (policy === 'domain' && domains.length) {
      const list = domains.map((d) => `@${d}`).join(', ');
      return `Members must join with a company email (${list}).`;
    }
    if (policy === 'invite') {
      return 'Only people you add below can join.';
    }
    return 'Any work email can join with your join code.';
  }

  function renderPortalNav(activePage) {
    const nav = document.querySelector('[data-portal-nav]');
    if (!nav) return;

    const app = global.GoldspirePortalApp;
    const session = app?.loadAdminSession?.();

    if (session?.adminToken) {
      const orgName = escapeHtml(session.displayName || 'Your team');
      nav.innerHTML = `
        <a href="index.html"${activePage === 'index' ? ' aria-current="page"' : ''}>Home</a>
        <a href="admin.html"${activePage === 'admin' ? ' aria-current="page"' : ''}>${orgName}</a>
        <a href="join.html"${activePage === 'join' ? ' aria-current="page"' : ''}>Invite members</a>
        <button type="button" class="nav-signout" id="portal-nav-signout">Sign out</button>
      `;
      nav.querySelector('#portal-nav-signout')?.addEventListener('click', () => {
        app.clearAdminSession();
        global.location.href = 'index.html';
      });
      return;
    }

    nav.innerHTML = `
      <a href="index.html"${activePage === 'index' ? ' aria-current="page"' : ''}>Home</a>
      <a href="create.html"${activePage === 'create' ? ' aria-current="page"' : ''}>Set up team</a>
      <a href="join.html"${activePage === 'join' ? ' aria-current="page"' : ''}>Join</a>
      <a href="install.html"${activePage === 'install' ? ' aria-current="page"' : ''}>Install</a>
      <a href="pricing.html"${activePage === 'pricing' ? ' aria-current="page"' : ''}>Pricing</a>
      <a href="admin.html"${activePage === 'admin' ? ' aria-current="page"' : ''}>Admin</a>
    `;
  }

  function renderPortalFooter() {
    const footer = document.querySelector('[data-portal-footer]');
    if (!footer) return;
    footer.innerHTML = `
      <span>Veil by Goldspire</span>
      <a href="privacy.html">Privacy</a>
      <a href="terms.html">Terms</a>
      <a href="install.html">Install</a>
      <a href="unlock.html">Unlock page</a>
      <a href="mailto:support@goldspireventures.com">Support</a>
    `;
  }

  global.GoldspirePortalNav = {
    renderPortalNav,
    renderPortalFooter,
    membershipSummary,
  };
})(typeof window !== 'undefined' ? window : globalThis);
