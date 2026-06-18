# Veil — admin guide

For IT admins and team owners setting up **Veil by Goldspire**.

## 1. Create your team

1. Open your Veil portal (e.g. `https://join-secure-text.goldspireventures.com/`)
2. Click **Set up your team**
3. Enter team name, your work email, company domain (optional), and a **team passphrase** (12+ characters)
4. Save the **admin sign-in key** and **join code** — the admin key is shown once only
5. Copy the **invite email** from the success screen and send to members

## 2. Invite members

Each member needs:

- Veil extension installed (Chrome or Edge)
- Join code
- Work email (must match your membership policy)
- Team passphrase (share via password manager — not in the same email as the join code)

Members: **Install** → extension popup → **Team** → join code + email → save passphrase → **refresh mail tab**.

## 3. Admin dashboard

Sign in at **Admin** with your admin key to:

- Add or remove members
- Rotate join codes
- Change team passphrase (syncs to extensions on next open)
- Configure DLP policy and view security activity (metadata only)

## 4. Enterprise deployment (recommended)

For organizations with Intune or GPO, push the extension and policy JSON so users skip manual join:

See `extension/docs/ENTERPRISE.md` for registry keys and policy fields (`teamPassphrase`, `setupComplete`, `copilotEnabled`).

## 5. Security notes

- Plaintext secrets are never sent to Veil’s API
- Security events contain categories and actions — not matched text
- Rotate the team passphrase if a member leaves or a device is lost

## Support

- Portal: install and join pages on your hosted portal
- Email: support@goldspireventures.com
