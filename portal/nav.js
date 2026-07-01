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

  function initBrandChrome() {
    document.querySelectorAll('.brand:not([data-brand-ready])').forEach((brand) => {
      brand.dataset.brandReady = '1';
      const mark = brand.querySelector('.brand__mark');
      if (mark && !mark.src.includes('icons/icon-48')) {
        mark.src = 'icons/icon-48.png';
      }
      if (!brand.closest('a.brand-link')) {
        const link = document.createElement('a');
        link.href = 'index.html';
        link.className = 'brand-link';
        link.setAttribute('aria-label', 'Veil home');
        brand.parentNode.insertBefore(link, brand);
        link.appendChild(brand);
      }
    });
  }

  function navHomeLink() {
    return `<a href="index.html" class="nav-home" aria-label="Veil home"><img src="icons/icon-48.png" alt="" width="26" height="26" /><span class="nav-home__text">Veil</span></a>`;
  }

  function renderPortalNav(activePage) {
    const nav = document.querySelector('[data-portal-nav]');
    if (!nav) return;

    initBrandChrome();

    const app = global.GoldspirePortalApp;
    const session = app?.loadAdminSession?.();
    const inHeader = Boolean(nav.closest('.site-header'));

    if (session?.adminToken) {
      const orgName = escapeHtml(session.displayName || 'Your team');
      nav.innerHTML = `
        ${inHeader ? '' : navHomeLink()}
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
      ${inHeader ? '' : navHomeLink()}
      <a href="index.html"${activePage === 'index' ? ' aria-current="page"' : ''}>Home</a>
      <a href="create.html"${activePage === 'create' ? ' aria-current="page"' : ''}>Set up team</a>
      <a href="join.html"${activePage === 'join' ? ' aria-current="page"' : ''}>Join</a>
      <a href="install.html"${activePage === 'install' ? ' aria-current="page"' : ''}>Install</a>
      <a href="pricing.html"${activePage === 'pricing' ? ' aria-current="page"' : ''}>Pricing</a>
      <a href="feedback.html"${activePage === 'feedback' ? ' aria-current="page"' : ''}>Feedback</a>
      <a href="admin.html"${activePage === 'admin' ? ' aria-current="page"' : ''}>Admin sign-in</a>
    `;
  }

  function renderPortalFooter() {
    const footer = document.querySelector('[data-portal-footer]');
    if (!footer) return;
    const support = global.GoldspirePortal?.SUPPORT_EMAIL || '';
    const supportLink = support
      ? `<a href="mailto:${support}">Support</a>`
      : '<a href="feedback.html">Support</a>';
    footer.innerHTML = `
      <span>Veil · <a href="https://goldspireventures.com">Goldspire Ventures Ltd</a></span>
      <a href="https://goldspire.dev">Goldspire Studio</a>
      <a href="privacy.html">Privacy</a>
      <a href="terms.html">Terms</a>
      <a href="install.html">Install</a>
      <a href="feedback.html">Feedback</a>
      <a href="unlock.html">Unlock page</a>
      ${supportLink}
    `;
  }

  global.GoldspirePortalNav = {
    renderPortalNav,
    renderPortalFooter,
    membershipSummary,
    initBrandChrome,
  };
})(typeof window !== 'undefined' ? window : globalThis);
