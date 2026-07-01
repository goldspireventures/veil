/**
 * Portal billing — early access phase UI and Stripe checkout.
 */
(function (global) {
  function config() {
    return global.GoldspirePortal || {};
  }

  function earlyAccessEndMs() {
    const raw = String(config().EARLY_ACCESS_END || '').trim();
    if (!raw) return null;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatEarlyAccessEnd() {
    const end = earlyAccessEndMs();
    if (!end) return '';
    try {
      return new Date(end).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return String(config().EARLY_ACCESS_END || '');
    }
  }

  function isEarlyAccess() {
    if (config().EARLY_ACCESS === false || String(config().EARLY_ACCESS) === 'false') return false;
    const end = earlyAccessEndMs();
    if (end != null && Date.now() >= end) return false;
    return true;
  }

  function teamPaymentLink() {
    return String(config().STRIPE_PAYMENT_LINK_TEAM || '').trim();
  }

  function billingPortalUrl() {
    return String(config().STRIPE_BILLING_PORTAL_URL || '').trim();
  }

  function applyBillingPhase(root) {
    const scope = root || document;
    const early = isEarlyAccess();
    scope.querySelectorAll('[data-billing-phase="early"]').forEach((el) => {
      el.hidden = !early;
    });
    scope.querySelectorAll('[data-billing-phase="paid"]').forEach((el) => {
      el.hidden = early;
    });
  }

  function initBillingPage() {
    applyBillingPhase(document);
    renderEarlyAccessBanner(document.querySelector('[data-early-access-banner]'));
  }

  function renderEarlyAccessBanner(container) {
    if (!container) return;
    if (!isEarlyAccess()) {
      container.innerHTML = '';
      container.hidden = true;
      return;
    }
    const endLabel = formatEarlyAccessEnd();
    const endLine = endLabel
      ? ` Free until <strong>${endLabel}</strong> — then list prices apply.`
      : ' List prices apply at general availability;';
    const endLine = endLabel
      ? ` Free until <strong>${endLabel}</strong> — then list prices apply.`
      : ' List prices apply at general availability;';
    container.innerHTML = `
      <div class="banner banner--success" role="status">
        <strong>Early access — no payment required.</strong>
        Create your team free while we’re in review.${endLine}
        We’ll email admins before any charge.
      </div>
    `;
    container.hidden = false;
  }

  function graceLabel(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return iso;
    }
  }

  async function startCheckout(apiAdmin) {
    if (!apiAdmin) throw new Error('Admin session required.');
    const result = await apiAdmin('/v1/orgs/me/billing/checkout', { method: 'POST' });
    if (!result?.url) throw new Error('Checkout unavailable.');
    window.location.href = result.url;
  }

  function renderBillingStatus(container, options = {}) {
    if (!container) return;
    const link = teamPaymentLink();
    const portal = billingPortalUrl();
    const sales = String(config().SALES_EMAIL || '').trim();
    const support = String(config().SUPPORT_EMAIL || '').trim();
    const orgBilling = options.orgBilling || null;
    const apiAdmin = options.apiAdmin || null;
    const salesLine = sales
      ? `<li>Enterprise volume pricing from 100+ seats — contact <a href="mailto:${sales}">${sales}</a>.</li>`
      : '<li>Enterprise volume pricing from 100+ seats — contact sales.</li>';

    if (isEarlyAccess()) {
      const endLabel = formatEarlyAccessEnd();
      container.innerHTML = `
        <p class="lede"><strong>Early access</strong> — your team cloud is free. No card on file.${endLabel ? ` Free through <strong>${endLabel}</strong>.` : ''}</p>
        <ul class="trust-list">
          <li>Team list price: <strong>$7 / user / month</strong>, billed annually ($84 / user / year), minimum 5 seats.</li>
          ${salesLine}
          <li>We’ll notify you before billing starts at general availability.</li>
        </ul>
        ${link ? `<p class="hint">Optional: <a href="${link}" rel="noopener noreferrer" target="_blank">Preview Team checkout</a> (procurement / finance review only).</p>` : ''}
      `;
      return;
    }

    if (orgBilling?.status === 'active' || orgBilling?.status === 'exempt') {
      container.innerHTML = `
        <p class="lede"><strong>Subscription active.</strong> Your team cloud is enabled.</p>
        <div class="btn-row">
          ${portal ? `<a class="btn btn--ghost btn--sm" href="${portal}" rel="noopener noreferrer" target="_blank">Manage billing</a>` : ''}
        </div>
        <p class="hint">$7 / user / month, billed annually ($84 / user / year). Minimum 5 seats.</p>
      `;
      bindCheckoutButton(container, apiAdmin);
      return;
    }

    if (orgBilling?.status === 'grace') {
      const until = graceLabel(orgBilling.graceEndsAt);
      container.innerHTML = `
        <p class="lede"><strong>Trial period</strong> — subscribe before ${until || 'your grace period ends'} to keep team cloud access.</p>
        <div class="btn-row" id="billing-checkout-row">
          <button type="button" class="btn btn--sm" id="billing-checkout-btn">Subscribe</button>
          ${portal ? `<a class="btn btn--ghost btn--sm" href="${portal}" rel="noopener noreferrer" target="_blank">Billing portal</a>` : ''}
        </div>
        <p class="hint">After the trial, new joins and extension sync are blocked until you subscribe.</p>
      `;
      bindCheckoutButton(container, apiAdmin);
      return;
    }

    const checkoutRow = apiAdmin
      ? `<div class="btn-row" id="billing-checkout-row"><button type="button" class="btn btn--sm" id="billing-checkout-btn">Subscribe</button></div>`
      : (link
        ? `<div class="btn-row"><a class="btn btn--sm" href="${link}" rel="noopener noreferrer" target="_blank">Subscribe</a></div>`
        : '');

    container.innerHTML = `
      <p class="lede">Subscribe to Veil Team cloud for admin, policy packs, and token storage.</p>
      ${checkoutRow}
      ${portal ? `<div class="btn-row"><a class="btn btn--ghost btn--sm" href="${portal}" rel="noopener noreferrer" target="_blank">Billing portal</a></div>` : ''}
      <p class="hint">$7 / user / month, billed annually ($84 / user / year). Minimum 5 seats.</p>
      ${orgBilling?.status === 'past_due' ? '<p class="hint">Payment failed — update your card in the billing portal to restore access.</p>' : ''}
    `;
    bindCheckoutButton(container, apiAdmin);
    if (!checkoutRow && !portal) {
      container.innerHTML += support
        ? `<p class="hint">Billing is not configured. Contact <a href="mailto:${support}">${support}</a>.</p>`
        : '<p class="hint">Billing is not configured. Contact support via Feedback.</p>';
    }
  }

  function bindCheckoutButton(container, apiAdmin) {
    const btn = container.querySelector('#billing-checkout-btn');
    if (!btn || !apiAdmin) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await startCheckout(apiAdmin);
      } catch (err) {
        btn.disabled = false;
        alert(err.message || 'Could not start checkout.');
      }
    });
  }

  global.GoldspireBilling = {
    isEarlyAccess,
    teamPaymentLink,
    billingPortalUrl,
    applyBillingPhase,
    initBillingPage,
    renderEarlyAccessBanner,
    renderBillingStatus,
    startCheckout,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
