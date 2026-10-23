# Kryvex Pro pilot: proposal only

Status: **on hold as of 2026-10-23.** No code, database, PayPal product,
Cloudflare resource, DNS record or policy page was created for this document.
Nothing in the existing MIT application changes under this plan until the
app-side phase is explicitly approved.

The owner's constraint is that the project must not pay for additional
Cloudflare services or a revenue path. The shape in §10 was chosen to fit free
tiers: Workers, D1, R2 and the email allowance all have a $0 tier at pilot
scale, and Workers Paid (US$5) is only a ceiling, not a requirement. That makes
a free-tier pilot technically possible, but it is still a hosted service with
accounts, payment handling, policy pages and an on-call surface. It is deferred
until the local product is complete; effort goes to the bundled Vexium runtime,
widgets and the rest of the desktop app first. No paid resource, subscription or
checkout is to be enabled to move this forward.

## 1. What is being sold

**Kryvex Vault**, one hosted capability: an encrypted workspace backup that a
customer can restore on a second machine.

- The app compresses a redacted copy of its local state, encrypts it on the
  device, and uploads only ciphertext.
- The service keeps the latest 10 snapshots (max 5 MiB each) for the customer,
  with 2 activated devices.
- The customer can download a snapshot on any activated device and restore it
  locally. Restore replaces local state only after a confirmation and writes a
  local rollback copy first. There is no server-side merge, no live two-way sync
  and no sharing.
- The free, MIT application keeps every existing feature, including local
  state, and gains no dependency on the service.

This is deliberately smaller than live sync. It needs no conflict resolution,
no CRDT, no per-record protocol and no server knowledge of the data. It still
gives a paying customer something a local app cannot do: recover a workspace
after a disk failure or move it to a new machine.

**What stays free and MIT:** the whole current app, its source, local storage,
services, browser, Shield, player, Home board, Vexium and every current
integration. No existing behaviour is moved behind a paywall.

**What is paid:** the hosted storage and the account that operates it. The
server checks entitlement on every request, so an MIT client cannot make the
service free by editing itself. Client-side checks are never the gate.

## 2. Product shape

| Item | Pilot proposal |
| --- | --- |
| Name | Kryvex Vault, sold under a Kryvex Pro entitlement |
| Benefit | Encrypted off-device backup, restore on a second device |
| Term | 12 months from verified payment, no auto-renew |
| Price | US$24 per year, configurable in the server catalogue |
| Devices | 2, self-service deactivate |
| Snapshots | Latest 10, 5 MiB each, 2 MiB recommended |
| Trial | None; 14-day refund window instead |
| Renewal | Manual purchase of another annual pass |
| Subscriptions | Not in the pilot; no Subscriptions API, no stored mandate |
| Activation codes | Not in the pilot; devices are approved through the account |
| Offline entitlement | Not in the pilot; the capability is online by definition |

An annual pass with manual renewal is intentional. It avoids the renewal,
dunning, cancellation and paid-through state machine that a subscription needs,
while still matching a recurring hosting cost. Auto-renew can be a later,
separately approved change.

No activation codes are proposed for the pilot. A code adds a hashed-code table,
code delivery, enumeration limits and a recovery path without adding protection
for a hosted service, because the server can already bind and revoke devices
directly. If code cards are wanted later for retail or offline use, that is a
separate feature with its own threat model.

## 3. Hosted architecture

One runtime, one backend: a Cloudflare Worker serving the storefront, account
pages, the licence API and the backup API, with D1 for records and R2 for
ciphertext. Email is the only external service, for sign-in codes. PayPal is the
only payment integration.

```
app / browser
     |
     | HTTPS
     v
cloud.xiondigital.net  (Cloudflare Worker)
     |-- static storefront and account pages
     |-- /api/auth/*      magic-code sign-in, device approval
     |-- /api/licence/*   entitlement, activation, deactivation
     |-- /api/backup/*    encrypted snapshot metadata and bytes
     |-- /api/paypal/*    order creation, capture, webhook
     |
     +--> D1   customers, purchases, entitlements, devices, events
     +--> R2   encrypted snapshots only
     +--> Resend   sign-in email
     +--> PayPal   Orders v2 and webhook verification
```

Why one Worker rather than Vercel plus Supabase plus Workers:

- the purchase, entitlement and backup paths share one database transaction
  boundary and one deployment;
- Cloudflare's free tier covers a pilot, and Workers Paid is a predictable
  US$5 per month if traffic outgrows it;
- Vercel's Hobby plan is non-commercial, so a Vercel deployment would require
  Pro;
- Supabase would add a second vendor, another secret set and its own free-tier
  pausing behaviour, without removing the need for the Worker.

Vercel is not used, and GitHub Pages is not used for the storefront or the
licence API. Cloudflare also serves the domain, so TLS and the subdomain need no
separate certificate work.

### Runtime boundaries

- The Worker is the only component with the D1 and R2 bindings.
- Neither database is exposed to a browser or to a client SDK.
- The app receives opaque session tokens, never a database key, PayPal secret or
  service-role credential.
- The storefront is static HTML served by the Worker, with a strict Content
  Security Policy and no third-party scripts.

## 4. Entitlement and device model

A licence is a seat pool for one customer and one product term. Each activated
device consumes one seat. The server checks the customer's active entitlement on
every backup request rather than trusting a local flag.

- Sign-in uses an emailed six-digit code. Codes are single-use, expire in ten
  minutes, allow five attempts, and are stored as an HMAC hash.
- The app starts a device authorisation and shows a short user code. The browser
  approves it after sign-in, and the app polls until approval, then collects one
  opaque device token. This avoids deep links, custom URL schemes and passwords.
- A session token is 32 random bytes. Only its SHA-256 hash is stored. Web
  sessions use an HttpOnly, Secure, SameSite=Lax cookie; the desktop app stores
  its device token with Electron `safeStorage` in its own user-data folder.
- Deactivation revokes the device and its sessions immediately. The seat is
  free for another device.
- Refund, reversal or dispute revokes the entitlement. Data is kept for export
  and is not deleted automatically.
- An expired pass turns off uploads and in-app restore, but the account can
  still sign in, export an encrypted envelope or delete its data for 90 days.
  Renewal restores access without a new account.

Offline signed entitlement tokens are deliberately omitted. Nothing local is
gated in this pilot, so a signed token would add key management and revocation
problems without protecting anything. If local Pro modules are later approved,
add short-lived signed tokens then.

## 5. Encryption design

The service is blind to workspace contents.

- The app derives a 256-bit key from a user passphrase with PBKDF2-SHA256,
  600,000 iterations and a random 16-byte salt, using Web Crypto in Electron.
- Each upload uses a fresh 12-byte AES-GCM IV. The envelope holds the format
  version, KDF parameters, IV, ciphertext and SHA-256 of the plaintext.
- The passphrase and derived key never leave the device and are never sent to
  the server or written to logs.
- The server validates envelope size and shape and stores bytes in R2. It does
  not decrypt, index or scan contents. It cannot restore a customer's data.
- The restore path downloads the envelope and decrypts locally after the user
  enters the passphrase.
- Losing the passphrase means the backup cannot be recovered. The UI must say
  this before the first upload and require an explicit acknowledgement. Support
  cannot reset it.

### What is in a snapshot

Include, after redaction:

- services and their display settings;
- bookmarks and feeds;
- themes, language, density, Home board and board widgets;
- player, wellness, Shield, Chromium and assistant preferences that are safe to
  move between machines;
- Rooms display name and relay lists.

Exclude:

- service cookies, sessions and sign-ins;
- history and download history by default;
- the VPN subtree, including binary and config paths and extra flags;
- download folder paths and other machine-local paths;
- API keys, model paths, extension records and installed-extension data;
- open browser tabs and window layout;
- wallpapers (already local and potentially large).

Wellness logs are health data. They are excluded unless the user ticks
**include health log** in the backup panel, which is off by default and carries
its own warning. Sticky notes stay in by default because they are ordinary
workspace content, but the panel states that the snapshot can contain personal
reminders.

The redaction list is part of the app-side unit tests, so a future settings field
cannot leak into a snapshot without a deliberate decision.

## 6. PayPal purchase flow

One-time Orders v2, server-created and server-captured. The browser is never
trusted for payment state.

```
browser -> Worker: POST /api/checkout {priceSlug}
Worker  -> D1:     insert purchase (pending), generate opaque purchaseId
Worker  -> PayPal: create order, custom_id = purchaseId, amount from catalogue
Worker  -> browser: approval URL only
browser -> PayPal: approve
PayPal  -> browser: return to /checkout/return?token=orderId
browser -> Worker: GET /checkout/return?token=orderId
Worker  -> PayPal: capture order with its own credentials
Worker  -> D1:     verify capture, then idempotent fulfil(purchaseId, captureId)
Worker  -> browser: entitlement active, device not yet activated
PayPal  -> Worker: PAYMENT.CAPTURE.COMPLETED webhook
Worker  -> D1:     insert event by provider id, run the same fulfil()
```

Rules enforced by the Worker:

- The catalogue is server-side. A client sends a price slug, never an amount.
- `custom_id` carries the opaque purchase id, not an email.
- The order is captured server-side with the secret. A return parameter or a
  client callback never grants access.
- Fulfilment requires `status === COMPLETED`, matching currency, matching
  amount, and the expected PayPal merchant id.
- Every provider event and capture id is unique in D1.
- Capture and webhook both call one idempotent `fulfil()` function, so a
  duplicate, delayed or out-of-order delivery cannot issue two entitlements.
- Webhooks are verified with PayPal's verification endpoint, including the
  transmission id, timestamp, signature and the exact raw body. A failed
  verification is recorded and ignored.
- The billing email and the account email are separate fields. Entitlement
  belongs to the verified account id, never to the payer email alone.
- Refund, reversal and dispute events revoke the entitlement and send an
  internal notice. They do not delete backups.
- Sandbox and live use different client ids, secrets, webhook ids and D1
  databases. A sandbox event can never reach the live database.

Sequence: purchase approval happens in the browser, but entitlement is issued
only after the server captures the order and verifies the capture.

### Operations

- Secrets live in Worker secrets: PayPal client id and secret, webhook id, D1
  and R2 bindings, email key, session pepper. None is in the repository, the
  bundle or the app.
- Sign-in mail goes out from a dedicated subdomain, proposed as
  `mail.xiondigital.net`, with its own SPF, DKIM and DMARC records, so the
  existing mailbox setup is untouched. Sending is not enabled until those
  records verify.
- Purchase, refund, dispute and fulfilment failures send a short notice to the
  owner address through the outbox. A failed notice is retried and never blocks
  entitlement delivery.
- D1 and R2 settings, CORS, and the custom domain are configured in
  `wrangler.jsonc`. No resource is created until phase 1 is approved.
- Owner alerts are the only operational notification in the pilot; there is no
  pager and no on-call rota.
- Keep a daily export or rely on the platform's point-in-time restore for D1,
  and test one restore before the first live sale.

## 7. Data model (Cloudflare D1)

D1 is SQLite. It has no row-level security; the security boundary is that only
the Worker holds the binding and every query scopes by the session's customer id.
That is stricter than exposing a database with policies. If Supabase is chosen
later, the equivalent policies are listed at the end of this section.

Timestamps are Unix milliseconds. All ids are random 128-bit values, except
provider ids.

| Table | Key fields | Constraints and indexes |
| --- | --- | --- |
| `customers` | id, email, email_norm, paypal_payer_id, status, created_at, verified_at | `email_norm` unique; status in active, locked, deleted |
| `products` | id, slug, name, active | `slug` unique |
| `prices` | id, product_id, currency, amount_cents, term_days, version, active | amount > 0; `(product_id, version)` unique; never update a sold row |
| `purchases` | id, customer_id, price_id, paypal_order_id, paypal_capture_id, status, amount_cents, currency, created_at, paid_at | order id unique; capture id unique; status check; index on customer |
| `entitlements` | id, customer_id, product_id, purchase_id, starts_at, ends_at, status, revoked_at | one per purchase; index `(customer_id, status, ends_at)` |
| `licences` | id, entitlement_id, customer_id, label, created_at, revoked_at | one licence per purchase |
| `devices` | id, licence_id, customer_id, name, fingerprint_hash, activated_at, last_seen_at, revoked_at | unique `(licence_id, fingerprint_hash)`; index customer |
| `sessions` | id, customer_id, device_id, token_hash, expires_at, created_at, last_seen_at, revoked_at | token hash unique; index customer and expiry |
| `login_codes` | id, email_norm, code_hmac, expires_at, attempts, used_at, created_at | index `(email_norm, created_at)`; delete after use or expiry |
| `device_authorizations` | id, device_code_hash, user_code, customer_id, approved_at, expires_at, consumed_at | user code unique among pending rows |
| `webhook_events` | provider_event_id, type, payload_sha256, received_at, processed_at, outcome | primary key provider event id |
| `backups` | id, customer_id, licence_id, device_id, object_key, sha256, bytes, format_version, created_at, deleted_at | object key unique; index `(customer_id, created_at desc)` |
| `outbox` | id, kind, payload, attempts, next_attempt_at, sent_at, last_error | index `(sent_at, next_attempt_at)` |
| `audit` | id, actor, action, subject, at, meta | index `(subject, at)` |

Operational rules:

- Entitlement issuance and device counts use a `D1` batch inside a transaction:
  re-read the active device count, insert the device, then return the new count.
- `fulfil()` inserts the entitlement with `ON CONFLICT DO NOTHING`, then reads it
  back, so retries converge.
- Deleting an account marks `customers.deleted_at`, revokes sessions and
  devices, deletes R2 objects, and keeps only the purchase records that tax and
  accounting rules require, with email replaced by a non-reversible hash.
- No foreign key cascade is relied on for money records; explicit writes keep
  the audit trail understandable.

If the implementation moves to Supabase Postgres, the equivalent policies are:
customers read their own row; entitlements and devices read-only to their owner;
no client insert or update on purchases, entitlements, webhooks or audit; all
writes through a server function using a service key that never reaches the
browser.

## 8. HTTP API

All endpoints are same-origin on `cloud.xiondigital.net`, JSON, with
`Cache-Control: no-store` on authenticated responses. The app uses bearer tokens;
the browser uses the session cookie. Mutations require same-origin checks.

| Method | Path | Purpose | Notes |
| --- | --- | --- | --- |
| POST | `/api/auth/request-code` | Send a sign-in code | Always 202, same latency and body; rate limited by email and IP |
| POST | `/api/auth/verify` | Exchange code for a session | Single use, 5 attempts, generic failure |
| POST | `/api/auth/logout` | Revoke current session | Idempotent |
| GET | `/api/me` | Customer, entitlement, devices | Scoped to the session |
| POST | `/api/device/start` | Begin device approval | Returns user code, verification URI, expiry |
| POST | `/api/device/approve` | Approve a user code | Requires a web session |
| POST | `/api/device/token` | Collect the approved token | Opaque, single use, device bound |
| POST | `/api/licence/deactivate` | Free a seat | Revokes device and sessions |
| POST | `/api/checkout` | Create a purchase and PayPal order | Price slug only |
| GET | `/api/checkout/return` | Capture after approval | Verifies server-side, never trusts query alone |
| POST | `/api/paypal/webhook` | Provider events | Signature verified; idempotent |
| POST | `/api/backup` | Upload an envelope | Active entitlement, quota, size cap |
| GET | `/api/backup` | List snapshot metadata | Newest first, no bytes |
| GET | `/api/backup/:id` | Download envelope | Owner and active device only |
| DELETE | `/api/backup/:id` | Delete a snapshot | Removes the R2 object and marks the row |
| DELETE | `/api/account` | Delete the account | Requires a fresh sign-in; asynchronous cleanup |
| GET | `/healthz` | Liveness | No database details |

Limits: sign-in 3 requests per email per hour and 20 per IP per hour; code
verification 5 attempts; checkout 5 per hour; backup upload 30 per hour and 1
concurrent; download 60 per hour. Limits are enforced in the Worker, not only in
the UI.

## 9. Failure handling

| Case | Behaviour |
| --- | --- |
| Webhook arrives before capture | Event stored; fulfil waits for a verified capture and is retried by the queue |
| Webhook duplicated | Primary key on provider event id; fulfil is idempotent |
| Capture succeeds, webhook lost | The return path captures and fulfils; a reconciliation job lists recent captures and repairs missing grants |
| Webhook verified but amount or merchant differs | No entitlement; audit row and internal alert |
| Email provider fails | Sign-in code is not reported as sent; the app shows a retry; no entitlement depends on email |
| R2 upload succeeds, D1 insert fails | Object key is deleted on the error path; an orphan sweep removes unreferenced objects older than 24 hours |
| Payment refunded | Entitlement revoked; backups kept; account can still download for 90 days |
| Chargeback | Writes and restores disabled; internal notice; no automatic deletion |
| Passphrase lost | No recovery; support can delete the data, not decrypt it |
| Device lost | User deactivates it from another device or the account page |
| App reinstalled | New device approval consumes a seat; deactivate the old one |
| Service outage | The free app is unaffected; the backup block reports offline and keeps local state |

Email delivery is best effort and never blocks fulfilment. A purchase can be
completed and the account accessed when the customer signs in later.

## 10. Costs

Assumptions, to be checked against current official pricing before launch:

| Item | Assumption | Monthly cost at pilot scale |
| --- | --- | --- |
| Domain | `xiondigital.net` is already owned | 0, existing renewal only |
| Cloudflare Worker | Free request allowance covers fewer than a few hundred customers | 0; US$5 if Workers Paid is needed |
| D1 | Free storage and read allowance is far above pilot volume | 0 |
| R2 | Free storage tier, no egress fee | 0 to a few cents |
| Email | Resend free tier, about 100 messages per day | 0 |
| PayPal | About 3.49% + US$0.49 per US transaction, higher internationally | About US$1.33 per US$24 sale |

At 100 annual passes at US$24: about US$2,400 gross, about US$133 in PayPal
fees, about US$60 to US$72 in fixed infrastructure, leaving about US$2,200
before tax and support. At 10 sales, about US$240 gross covers the first year of
infrastructure several times over. Tax registration, VAT/OSS and accounting are
separate costs and are not estimated here. A PayPal business account and seller
onboarding are prerequisites for live payments.

## 11. Files

### New private repository: `kryvex-cloud`

The server is not MIT and is not published with the app.

```
wrangler.jsonc
package.json
tsconfig.json
migrations/0001_init.sql
src/index.ts              router, security headers, error mapping
src/catalogue.ts          products and prices, versioned constants
src/auth.ts               codes, sessions, device approval
src/licence.ts            entitlement checks, activation, deactivation
src/paypal.ts             order create, capture, webhook verification
src/fulfil.ts             single idempotent grant path
src/backup.ts             R2 put/get/list/delete, quotas
src/db.ts                 typed queries and transactions
src/email.ts              sign-in mail, outbox retries
src/rate-limit.ts         per-email and per-IP counters
src/audit.ts              internal events
src/pages.ts              static storefront, account and policy routing
public/index.html         pricing and checkout entry
public/account.html       devices, backups, deletion
public/terms.html
public/privacy.html
public/refunds.html
public/security.txt
test/auth.test.ts
test/paypal.test.ts
test/fulfil.test.ts
test/licence.test.ts
test/backup.test.ts
test/rate-limit.test.ts
docs/runbook.md           secrets, rotation, restore, incident steps
docs/reconciliation.md    PayPal and R2 reconciliation
.github/workflows/deploy.yml
```

### App additions, only after approval

These are additive and do not alter existing behaviour:

```
src/lib/cloud.ts             API client, envelope format, redaction
src/lib/cloud-crypto.ts      PBKDF2 and AES-GCM helpers
src/components/CloudVault.tsx  backup and restore panel
src/views/Settings.tsx       one new optional block
electron/main.ts             safeStorage read/write for the device token
electron/preload.ts          two narrow bridge methods
src/types.ts                 token and envelope types
tests/cloud-crypto.test.ts
tests/cloud-redaction.test.ts
```

The MIT application remains MIT. The service is the paid part, and the Worker
refuses requests without an active entitlement, so publishing the client does
not publish the service.

## 12. Policies and customer-facing pages

Before a live sale:

- **Terms of Service:** what Vault is, account responsibilities, annual term, no
  auto-renewal, acceptable use, availability target, termination, liability,
  governing law.
- **Privacy Policy:** account email, PayPal payer id, purchase and device
  metadata, IP and security logs, encrypted blobs, processors (Cloudflare,
  PayPal, email provider), retention, international transfers, access and
  deletion rights, contact address. It must state that backups can contain
  sensitive workspace entries, including health data when the customer opts in,
  and that the operator cannot read them.
- **Refund Policy:** 14 days, how to request, 5 to 10 business days to process,
  entitlement revoked on refund, data retained for export.
- **Acceptable Use:** no unlawful content in backups, no attempts to use the
  service as general storage, no resale of seats.
- **Security page or `security.txt`:** disclosure address, scope, no bounty
  promise unless one is funded.
- **Cookie notice:** session cookie only, no analytics or ad scripts.
- **Tax notice:** prices, currency and whether tax is included, with the seller
  responsible for VAT/sales tax.

Also required in the app: a clear statement that Vault is optional, that the
free app remains complete, that the passphrase cannot be recovered, and that the
service stores ciphertext only.

## 13. Phases and effort

| Phase | Work | Estimate |
| --- | --- | --- |
| 0 | Approve capability, price, term, region, retention and device limit | 1 day |
| 1 | Worker skeleton, D1 migration, sign-in and device approval, `/api/me` | 3 to 4 days |
| 2 | PayPal sandbox: catalogue, order, capture, webhook, idempotent fulfil, reconciliation | 3 to 4 days |
| 3 | App: crypto, redaction, upload, list, restore, safeStorage token, settings block | 4 to 5 days |
| 4 | Policies, account page, accessibility pass, two-device dry run, live cutover | 2 to 3 days |

Total: about two to three weeks of focused work, plus review time. Phase 2 can
run in parallel with phase 3 once the API contract is frozen.

Launch gate: a sandbox purchase produces exactly one entitlement after a
duplicated webhook; a second device restores a snapshot and decrypts it; a
refund revokes access but leaves the data downloadable; and the free app still
works with the service unreachable.

## 14. Test plan

- **PayPal:** sandbox order creation, capture, duplicate capture, webhook before
  capture, duplicate webhook, refund, reversal, amount mismatch, currency
  mismatch, wrong merchant, invalid signature, sandbox event against live data.
- **Entitlement:** one grant per purchase under concurrent fulfil, expiry
  boundary, renewal extends the correct term, refund revokes, deactivation frees
  a seat, third device refused with a clear message.
- **Auth:** single-use codes, expiry, attempt limit, enumeration-safe responses,
  session revocation, device-code expiry and single consumption, rate limits.
- **Backup:** quota, size cap, hash mismatch, wrong owner, revoked device,
  deletion removes the object, restore decrypts, wrong passphrase fails
  cleanly, redaction strips every excluded field.
- **Least privilege:** no client access to D1 or R2, no secrets in the bundle,
  no service-role key in the app, scoped queries with a second account's ids.
- **Resilience:** email outage, PayPal outage, R2 error, D1 contention, retry
  queue, orphan sweep, account deletion.
- **App:** free app unaffected offline, settings block hidden in web preview,
  token stored with `safeStorage`, accessibility of the panel, localization of
  new copy, restore confirmation and rollback copy, optional health-log
  inclusion off by default.
- **Policy pages:** links, refund wording, deletion request path, security.txt.

## 15. Decisions needed

1. Approve **encrypted snapshot backup** as the one hosted capability, or choose
   live sync instead (considerably larger).
2. Approve **US$24 per year, manual renewal**, or set another price and term.
3. Approve **2 devices**, 10 snapshots and 5 MiB per snapshot.
4. Approve the **device-approval sign-in** (emailed code, no passwords, no
   activation codes) for the pilot.
5. Choose the data region and confirm retention: 90 days of export after
   expiry; account data kept until deletion; purchase records kept for the
   accounting period.
6. Approve the account subdomain, proposed as `cloud.xiondigital.net`.
7. Confirm that the small app client may be added to the MIT repository, with
   the service remaining private.
8. Confirm who handles support, refunds and tax registration before the first
   live sale, and provide the legal entity name and address for the policy
   pages.
9. Approve the email subdomain and DNS records for sign-in mail, which are the
   only DNS changes in the plan.

Until those are answered, this remains a proposal. The next permitted step is
turning an approved phase into schema and route stubs, not creating PayPal
products or Cloudflare resources.
