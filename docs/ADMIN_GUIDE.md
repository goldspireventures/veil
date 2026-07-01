# Veil — admin guide

For **IT admins and team owners**. Goal: set up your org end-to-end without support email.

**Portal:** `https://veil.goldspireventures.com`  
**Admin console:** `https://veil.goldspireventures.com/admin.html`

---

## 1. Create your team (one time)

1. Open **Set up your team** (`create.html`)
2. Enter **team name**, **your work email**, optional **company domain**
3. Choose **What kind of team is this?** (e.g. Technology / SaaS)
   - We set a **company default** policy pack (e.g. Engineering for tech)
   - We enable a **pack library** for other departments (e.g. Finance for your finance group)
4. Set a **team passphrase** (16+ chars) — use **Generate passphrase** next to the field
5. Click **Create team** (not Generate)
6. **Save immediately:** admin sign-in key, join code — **admin key is shown once only**
7. Copy the **invite email** from the success screen

Early access is off. Team cloud requires a card in **Admin → Overview → Billing** after setup (short trial included). See [pricing](https://veil.goldspireventures.com/pricing.html).

---

## 2. Admin console layout

Sign in with your admin key. The dashboard uses **tabs** (not one long page):

| Tab | Use for |
|-----|---------|
| **Overview** | Setup checklist, metrics, billing |
| **Settings** | Team name, passphrase, who can join, **sub-teams** |
| **People** | Member emails, sub-team assignment, connected browsers |
| **Access** | Join codes, **company default pack**, **pack library** |
| **Security** | Activity stats, SIEM webhook, exports |

Follow the **Setup guide** on Overview — each step links to the right tab.

---

## 3. Invite members

Each member needs:

| Requirement | Admin action |
|-------------|----------------|
| Extension installed | Send [install link](https://veil.goldspireventures.com/install.html) |
| Join code | **Access** tab → Create join code |
| Work email on allow list | **People** tab → Add member (required if invite-only) |
| Passphrase | Syncs automatically for cloud teams; or share via password manager |

**Member steps:** Install → popup **Team** → join code + email → **refresh mail tab (F5)**.

Membership modes (**Settings**):

- **People I add** — invite-only; add emails in People first
- **Company email** — anyone `@yourdomain.com` with a join code
- **Anyone with join code** — open (use carefully)

---

## 4. Policy packs & sub-teams

### Two concepts

1. **Company default pack** — applies to everyone **not** on a sub-team  
2. **Pack library** — which packs you can assign to **sub-teams**

Example: **Tech company**, most staff on **Engineering** default; **Finance** sub-team uses **Finance** pack.

### Company default

1. **Access** tab → **Company default pack** → choose pack → **Apply company default**
2. Members sync on next extension open

### Pack library (enable packs for departments)

1. **Access** tab → **Pack library** → check packs you need (Finance is pre-enabled for tech companies)
2. Uncheck packs you don’t use (cannot remove the current company default)

### Sub-teams

1. **Settings** tab → create sub-team (e.g. `Finance`)
2. **Set policy** on that row → pick a pack from your library
3. **People** tab → **Sub-team** column → assign members
4. Those members get the sub-team pack instead of the company default

---

## 5. Join codes & devices

- **Access** → join codes: create, share, deactivate old codes
- **People** → **Connected browsers**: browser, OS, extension version, last active
- **Disconnect** lost laptops; member re-joins with join code + email

---

## 6. Security & compliance

- **Security** tab: 7/30/90-day stats, by category/source, recent events (metadata only — no secret content)
- Export JSON/CSV for audits
- **SIEM webhook**: forward new events to Splunk/Sentinel (metadata only)

---

## 7. Enterprise deployment (optional)

For Intune/GPO: push extension + policy JSON so users skip manual join.

See [extension/docs/ENTERPRISE.md](../extension/docs/ENTERPRISE.md).

---

## 8. Billing

- **Overview** → Billing: subscription status; subscribe via Stripe when required
- Early-access orgs are grandfathered; new orgs get a short trial after GA

Internal: [BILLING.md](BILLING.md)

---

## 9. Security practices

- Never email admin key + join code + passphrase together
- Rotate team passphrase if someone leaves (**Settings**)
- Revoke disconnected browsers under **People**

---

## Support escalation (when self-serve isn’t enough)

| Issue | Try first | Then |
|-------|-----------|------|
| Member can’t join | Email on People list? Active join code? | [feedback](https://veil.goldspireventures.com/feedback.html) |
| Policy not applying | Sub-team assigned? Extension reopened? | Admin → Refresh |
| Lost admin key | — | Contact support (key not recoverable; may need new org) |

**Feedback:** [feedback.html](https://veil.goldspireventures.com/feedback.html) — describe steps, no secrets.
