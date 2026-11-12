# Gym Manager

One app for running a gym: members, plans, UPI QR payments, offers, attendance (fingerprint machine, QR, desk), trainers' workout plans, and an owner dashboard. Owners, desk staff and trainers use the web panel. Members use the same site on their phones, and it can be installed to the home screen.

## What each person can do

| | Owner | Desk staff | Trainer | Member |
|---|---|---|---|---|
| See today's dashboard, renewals due | Yes, with money figures | Yes, no money figures | | |
| Add and edit members, record cash and UPI payments | Yes | Yes | | |
| Confirm or reject members' UPI payments | Yes | Yes | | |
| Create festival, New Year and anniversary offers | Yes | | | |
| Give a custom price (with a reason) | Yes | | | |
| Change plans and prices, staff accounts, settings | Yes | | | |
| Fingerprint machine setup | Yes | | | |
| Download payments for Excel | Yes | | | |
| Write workout and diet plans | Yes | Yes | For their own members | Reads their own |
| Pay by UPI QR, check in by QR, see history | | | | Yes |

## How the main flows work

**Payment by UPI QR.** The member picks a plan in the app. The server works out the price, applying any running offer or a code they enter. The app shows a UPI QR with that exact amount, plus a button that opens GPay, PhonePe or Paytm. After paying, the member types the 12-digit UTR. Staff check it in the bank app and tap **Confirm**. The membership extends (a renewal adds on after the current end date, so no days are lost) and the fingerprint machine is updated automatically. There are no payment gateway fees, because money goes straight to the gym's UPI ID.

**Offers.** Only the owner creates them. Each offer has a percent or rupee discount, start and end dates, optional plan limits, an optional code, and an optional "new members only" setting. Offers without a code apply automatically during their dates. If several apply, the member gets the biggest discount. Every payment records the list price, the discount and the offer name, and these columns are in the Excel export.

**Fingerprint machine (eSSL / ZKTeco with ADMS, also called "Cloud Server").**
- When a payment is confirmed, the member (user ID = their member number, M0007 = 7) is added to the machine.
- When a plan ends or an account is disabled, the member is removed from the machine. This check runs automatically every hour, and the owner can also run it from the machine page.
- When a member enrols a finger, the machine sends the fingerprint to the server, which keeps a copy. After a renewal it's pushed back, so members never re-enrol.
- If the server doesn't have someone's fingerprint copy yet, they're **not** removed, because that would delete a fingerprint the system can't restore. Instead they're listed under "Needs your attention".
- Every punch becomes attendance. A punch from someone whose plan has expired shows on the dashboard ("Tried to enter with an expired plan").
- The machine connects out to the server, so the gym needs no static IP and no PC. A new machine is ignored until the owner adds its serial number.

**QR check-in.** Open `/kiosk` on any old tablet or phone at the entrance. It shows a code that changes every minute. Members scan it with their camera and are checked in, so a screenshot shared at home won't work. Expired members are told to renew.

## Before going live: test with the real machine

The machine code follows the standard ADMS push protocol and is covered by tests, but it hasn't been tried on the gym's actual unit. Do this once, in about 15 minutes:

1. Make sure the machine menu has **Comm > Cloud Server Setting** (or "ADMS"). If it doesn't, the model needs a firmware update or a different unit. Send the model name printed on the machine.
2. Add the machine on the **Fingerprint machine** page, then enrol one test member's finger at the machine.
3. Check that the member shows "fingerprint saved". Then disable that member, wait about a minute, and confirm their thumb no longer works. Re-enable them and confirm it works again.
4. If a step fails, the **Latest punches** list and the API log show exactly what the machine sent.

If the machine is wired to a door lock, removal physically blocks entry. If it's attendance-only, expired members can still punch, but they're flagged on the dashboard.

## Running it on a server (about ₹700 a month)

Everything runs on one small VPS with Docker: PostgreSQL, the API, and Caddy, which provides HTTPS and serves the site.

1. Buy a small VPS (2 vCPU / 4 GB RAM, Ubuntu) and a domain. Point the domain's A record to the server's IP.
2. On the server:
   ```bash
   curl -fsSL https://get.docker.com | sh
   git clone <this repo> gym && cd gym
   cp .env.example .env && nano .env   # fill in domain, passwords, owner phone
   docker compose up -d --build
   ```
3. Open `https://your-domain`. Sign in with the owner phone and password from `.env`. Then go to **Settings** and enter the gym name and UPI ID.
4. Backups: the `backup` service saves the database to `./backups` every day and keeps 14 days. Copy that folder off the server weekly (for example to Google Drive or Cloudflare R2) so a server failure can't lose everything.

Port 80 must stay open: fingerprint machines usually send data over plain HTTP, and `/iclock/*` is served there without a redirect.

## Development

```bash
# API
cd backend && pip install -r requirements.txt pytest httpx
uvicorn app.main:app --reload            # SQLite by default, owner 9999999999 / admin123
python -m pytest -q tests                # 32 tests; set TEST_DATABASE_URL to run on Postgres

# Web
cd frontend && npm install && npm run dev   # http://localhost:5173, proxies /api to :8000
```

API docs: `http://localhost:8000/docs`. The future mobile app can use the same API (`/api/me/*` covers everything a member does).

### Layout
```
backend/app/
  main.py          startup, default plans, owner account
  models.py        tables
  services.py      membership dates, status, receipts, rotating check-in code
  pricing.py       offers and discounts (server-side only)
  device.py        fingerprint machine protocol and add/remove rules
  routers/         auth, members, plans, payments, attendance, offers, devices, dashboard, me
frontend/src/
  pages/           owner / staff / trainer screens
  member/          member phone app
  ui.tsx           buttons, status pills, plate gauge, modal, toast
```

### Known limits in v1
- Tables are created on startup (no migrations yet). Add Alembic before changing the schema on a live database.
- Reminders open WhatsApp with the message filled in, and staff press send. Fully automatic WhatsApp messages need the WhatsApp Business API, which costs extra per message.
- iPhone users use the website (installable from Safari's "Add to Home Screen"). The native app is the next phase.
