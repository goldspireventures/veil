# Veil — market launch checklist

Use this before announcing Veil publicly or onboarding paying customers.

## Product

- [ ] `npm test` passes (62+ tests)
- [ ] `npm run package` → load `extension/dist` in Chrome + Edge
- [ ] Team join → copilot on → paste API key in Outlook/Gmail → Encrypt / Tokenize
- [ ] Token round-trip: Outlook compose → send → Gmail read → click reveal
- [ ] Re-lock banner dismisses on buttons and outside click
- [ ] Managed policy deploy (see `extension/docs/ENTERPRISE.md`) tested on one device

## Portal & web

- [ ] Landing: `index.html` (or hosted portal root)
- [ ] Create / join / admin / install / privacy / terms pages live
- [ ] `npm run env:apply` syncs portal to `api/public`
- [ ] API serves portal pages (`/`, `/join.html`, etc.)
- [ ] Invite email template on team creation success screen

## Extension distribution

- [ ] Chrome Web Store listing submitted (see `docs/STORE_SUBMIT.md`, run `npm run package:store`)
- [ ] Edge Add-ons listing submitted
- [ ] Enterprise `.crx` or policy install path documented for IT
- [ ] Version number bumped in `extension/manifest.json`

## Legal & trust

- [ ] Privacy policy published (`privacy.html`)
- [ ] Terms published (`terms.html`)
- [ ] Brand assets consistent (`docs/BRAND.md`, extension icons, portal favicon)
- [ ] Threat model reviewed (`extension/docs/THREAT_MODEL.md`)
- [ ] Support email monitored: support@goldspireventures.com

## Operations

- [ ] Production API healthy (`/health`)
- [ ] Database backups configured
- [x] User feedback path (popup, portal, context menu)
- [ ] Error/uptime monitoring on API host (configure UptimeRobot/Better Stack on `/health`)
- [ ] Incident contact documented
- [ ] Stripe: `npm run stripe:setup` → payment link in `.env` → `npm run env:apply`
- [ ] Stripe webhook → `https://veil-api.goldspireventures.com/v1/webhooks/stripe` + `STRIPE_WEBHOOK_SECRET` on Railway
- [ ] Portal deployed (`join-veil`) with `EARLY_ACCESS` + payment link in `portal/config.js`

## Customer success

- [ ] `docs/ADMIN_GUIDE.md` shared with IT admins
- [ ] `docs/MEMBER_GUIDE.md` shared with end users
- [ ] `docs/MANUAL_TEST.md` for QA / pilot validation
- [ ] First pilot onboarding call scheduled

## Post-launch (30 days)

- [ ] Collect pilot feedback on Outlook/Gmail edge cases
- [ ] Chrome + Edge store reviews responded to
- [ ] Copilot / tokenize analytics from security events (metadata only)
