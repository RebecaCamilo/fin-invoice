# FinInvoice — Invoicing and Receivables Management

A billing tool for Brazilian freelancers, independent professionals and micro-businesses that invoice
other companies (B2B): register payers, estimate a grossed-up invoice total from a target payout,
track the life cycle of each charge and export a professional invoice as PDF.

Client/server architecture: a REST API on Node with a **SQLite database stored inside the project
folder**, and a plain HTML/CSS/JS front end with no build step.

---

## Getting started

### Requirements

- **Node.js 24 or newer** (developed and verified on 24.21). The project uses the built-in
  `node:sqlite` module, so there is no native dependency to compile. Check yours with
  `node --version`.
  > On Node 22.5–23.x the module exists but may still sit behind the `--experimental-sqlite` flag,
  > depending on the exact release. Node 24 runs it unflagged.
- Nothing else. No database server, no Docker, no global CLI.

### Install and run

```bash
npm install
npm start
```

Then open **http://localhost:3000**.

The database file is created automatically at `data/fininvoice.db` the first time the server starts.

### First access

1. The sign-in screen opens in **Create account** mode, because no profile exists yet. Pick a
   username and a password of at least 6 characters.
2. Go to the **Issuer** tab and fill in the payee details — your name, tax ID, tax regime and Pix
   key. The invoice cannot be generated without them.
3. Register a payer under **Clients**. Typing a CNPJ and clicking *Look up* fills in the company
   details automatically; for individuals, the postal code fills in the address.
4. Build the charge under **Invoices**. Enter the payout you want to receive for each service; the
   invoice total includes a gross-up based on the selected estimate rate. Then **Save invoice** or
   **Generate invoice (PDF)**.

### Available scripts

| Command | What it does |
| --- | --- |
| `npm start` | Starts the server on `http://localhost:3000`. |
| `npm run dev` | Same, restarting on every file change (`node --watch`). |
| `npm test` | Runs the financial calculation tests with Node's built-in test runner. |

### Configuration

Both variables are optional:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port the HTTP server listens on. |
| `DATABASE_PATH` | `data/fininvoice.db` | Location of the SQLite file. Accepts `:memory:`. |

```bash
# bash
PORT=4000 npm start
```

```powershell
# PowerShell
$env:PORT = 4000; npm start
```

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| `EADDRINUSE` on startup | Another process holds the port. Start with a different `PORT`. |
| "Server unavailable" in the browser | The API is down. Check the terminal running `npm start`. |
| Forgot your password | There is no recovery flow. Create another profile, or delete `data/fininvoice.db` to start over — **this erases every account, client and invoice**. |
| CNPJ or postal code lookup fails | BrasilAPI/ViaCEP are public services; if they are unreachable the form still accepts manual input. |

---

## Project layout

```
server/
  index.js                  Bootstrap: picks port and database path, opens the socket
  app.js                    createApp(db) — wires Express WITHOUT listening on a port
  db.js                     createDatabase(path) — node:sqlite connection + schema
  security.js               PBKDF2, constant-time comparison, id and token generation
  middleware.js             Session cookie, requireAuth, error handler
  errors.js                 HttpError + shorthands (badRequest, notFound, conflict…)
  repositories/
    users.js                Users and sessions
    catalog.js              Payee and clients (shared across profiles)
    invoices.js             Invoices and items — the isolation boundary, by ownerId
  routes/
    auth.js                 /api/auth
    catalog.js              /api/issuer and /api/clients
    invoices.js             /api/invoices
  services/
    invoices.js             Validation and pricing (recomputes every total)

shared/
  finance.js                Calculation engine used by BOTH the server and the browser

public/
  index.html                Sign-in screen + the four dashboard tabs
  assets/css/styles.css     Minimal corporate styling, mobile-first
  assets/js/api-client.js   HTTP client for the API
  assets/js/app.js          UI orchestration
  assets/js/format.js       Currency, date and tax-ID formatting
  assets/js/lookup.js       BrasilAPI (CNPJ) and ViaCEP (postal code)
  assets/js/pdf.js          PDF composition (jsPDF)
  assets/js/shared-bootstrap.js  Imports shared/finance.js and exposes window.Finance

data/fininvoice.db          SQLite database (created at runtime, not committed)
```

---

## API

Every route under `/api`, except `/api/auth/*`, requires an active session. Errors always respond
with `{ "error": "message" }`.

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/auth/status` | Whether any profile exists yet. |
| `POST` | `/api/auth/register` | Creates the account and opens a session. |
| `POST` | `/api/auth/login` | Authenticates and opens a session. |
| `POST` | `/api/auth/logout` | Ends the session. |
| `GET` | `/api/auth/me` | Current session user (401 when there is none). |
| `GET` `PUT` | `/api/issuer` | Payee details. |
| `GET` `POST` | `/api/clients` | Lists and registers payers. |
| `PUT` `DELETE` | `/api/clients/:id` | Edits and deletes a payer. |
| `GET` `POST` | `/api/invoices` | Lists and issues invoices **for the session user**. |
| `GET` | `/api/invoices/next-number` | Next number in the user's own series. |
| `GET` `PUT` `DELETE` | `/api/invoices/:id` | Operations on your own invoice. |
| `PATCH` | `/api/invoices/:id/status` | Confirms (`paga`) or reopens (`pendente`) the charge. |

---

## Business rules

### Access and data segregation

- **BR-01:** The dashboard is only rendered after the server authenticates the user; without a valid
  session, data routes respond 401.
    - **Reason:** demonstrates per-profile data segregation, a baseline requirement for any
      multi-user financial product.
- **BR-02:** Each user can read, edit, settle, delete and export **only the invoices they issued**.
  The filter lives in the `WHERE` clause of every repository query — not in the UI, not in the route.
    - **Reason:** a UI filter can be bypassed and a route check gets forgotten the moment someone
      writes a new route; in the repository, the isolation holds for any future consumer of the layer.
- **BR-03:** Another user's invoice responds **404**, not 403.
    - **Reason:** 403 would confirm that the id exists, leaking the existence of someone else's
      charges.
- **BR-04:** Each user has an independent numbering series (`FAT-YYYY-0001`), enforced by
  `UNIQUE (owner_id, number)`.
    - **Reason:** a shared counter would punch unexplained gaps into each payee's series — and would
      expose how much the other profile is billing.
- **BR-05:** The password is transmitted once and stored only as a PBKDF2-SHA256 hash (150,000
  iterations, 16-byte per-user salt), verified with a constant-time comparison.
    - **Reason:** plaintext passwords leak into other systems through credential reuse, and a naive
      comparison leaks information through response timing.
- **BR-06:** The session is an opaque 256-bit token in an `httpOnly`, `sameSite=lax` cookie, valid
  for 12 hours and stored in the `sessions` table.
    - **Reason:** `httpOnly` stops an XSS from reading the session, `sameSite` blocks CSRF, and the
      short lifetime limits the window of a leaked token. An opaque token can be revoked instantly on
      sign-out, which a self-contained JWT could not.
- **BR-07:** Clients and payee details are shared across profiles; a client referenced by any
  invoice, from any user, cannot be deleted.
    - **Reason:** a product decision for the MVP (the client base belongs to the business, not to the
      operator); the delete guard keeps one profile from breaking another's history.

### Actors

- **Payee** (*Issuer* tab): the party that provided the service and is entitled to the money. Holds
  registration details, tax regime and the Pix settlement key.
    - **Reason:** the invoice has to identify the creditor and carry the payment instruction —
      without the printed Pix key the payer cannot settle it.
- **Payer** (*Clients* tab): the company or individual liable for paying the invoice.
    - **Reason:** separating the two roles is what allows one registration to be reused across many
      charges and the document to be addressed correctly.

### Gross-up estimate

Service amounts represent the payout the freelancer wants to receive. For an estimated 6% rate, the
app calculates `Invoice total = Target payout / (1 - 0.06)`, then shows the difference as a gross-up
adjustment. For example, a R$ 10,000.00 target payout results in a R$ 10,638.30 invoice total and a
R$ 638.30 adjustment.

- The **Charge the estimated 6% gross-up to the client** toggle controls whether the adjustment is
  included in the invoice. When off, the invoice remains at the service amounts entered; the
  freelancer remains responsible for any separate tax payments.
- **Simples Nacional** → illustrative **6%** rate used for the gross-up estimate.
- **MEI** → **0%** rate in this estimate, so invoice total equals target payout.
- This estimate does not determine actual tax liability or whether the payer must withhold tax.
  Confirm the applicable rate and invoicing obligations with an accountant.
- **The server never trusts the totals sent by the browser**: it recomputes everything from the line
  items and the regime stored in the payee record. The live preview on screen uses the very same
  module (`shared/finance.js`).
    - **Reason:** sharing the module keeps the preview and stored value in sync, while server-side
      recomputation prevents clients from forging invoice totals.

### Invoice life cycle

| Status | Where it comes from |
| --- | --- |
| **Pending** | Issued, due date still ahead. |
| **Paid** | Settlement confirmed manually by the user (*Settle* button). |
| **Overdue** | Derived: pending, with a due date earlier than today. |

- **Reason:** only the payee knows the money arrived (there is no bank reconciliation in the MVP), so
  settlement is manual; the due date, on the other hand, is deterministic, so it is computed and
  never stored — the database accepts only `pendente` or `paga`, enforced by a `CHECK`.

---

## Language and formatting

The interface, the API messages and the PDF are in **English**. There is no i18n layer: single
language, no switcher, no key dictionary.

- **Money follows the Brazilian convention** (`R$ 1.699,80`), even with an English interface.
    - **Reason:** it is a charge in reais, settled in Brazil. The payer reads the figure without
      mental translation and it matches the bank statement exactly.
- **Dates read `Oct 20, 2026`**, instead of `20/10/2026` or `10/20/2026`.
    - **Reason:** in an app whose language and currency come from different countries, `10/07` is
      July to some readers and October to others. A spelled-out month removes the ambiguity from a
      financial document.
- **Brazilian legal terms stay in Portuguese**: `Simples Nacional`, `MEI`, `Anexo III`, `DAS`,
  `CNPJ`, `CPF`, `CEP`, `Pix`.
    - **Reason:** these are proper names of legal instruments. "National Simple" does not exist and
      is not searchable; translating it would hurt exactly the reader who needs to verify the
      information.

### Tax regime help

A `?` button next to the **Tax regime** field (*Issuer* tab) and next to the regime line in the
invoice summary opens a modal explaining how the estimate affects the target payout and invoice
total, with a side-by-side comparison and a caveat that actual tax treatment may differ.

Why a modal rather than a tooltip or a dedicated page: the content includes a table and a legal
disclaimer, which do not fit in a bubble and vanish on touch screens; and it has to sit where the
user picks the regime, not two clicks away. It uses the native `<dialog>` element, which already
provides focus trapping, `Esc` to close and proper dialog semantics.

---

## Automated tests

Financial gross-up calculations and invoice pricing are covered by `shared/finance.test.js` and
`server/services/invoices.test.js`:

- `npm test` already runs `node --test`, the built-in runner, with no extra dependency.
- `supertest` is installed as a dev dependency.
- `createDatabase(':memory:')` returns a clean, isolated database with the schema applied.
- `createApp(db)` returns the application **without listening on a port**, so a test needs no network
  and never touches the real database file.

A test skeleton looks like this:

```js
import { createDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';

const app = createApp(createDatabase(':memory:'));
// request(app).post('/api/auth/register')...
```

Worth testing, in order of value:

1. **Isolation between users** (BR-02/BR-03): Bob gets 404 when reading, editing, settling or
   deleting one of Ana's invoices. The most critical rule, and the easiest to break in a refactor.
2. **Authoritative pricing**: send `gross: 1` in the payload and assert the stored value is the one
   computed from the line items.
3. **Tax rule**: Simples Nacional at 6% and MEI at 0%, straight against `shared/finance.js` (pure
   functions).
4. **Life cycle**: `statusOf` returning `vencida` by date, and `paga` taking precedence over the
   deadline.
5. **Validation** in `services/invoices.js`: no items, due date before issue date, zero quantity.
6. **Sessions**: a protected route without a cookie responds 401; sign-out invalidates the token.

Hard to test with little payoff: `public/assets/js/app.js` (DOM wiring — would need jsdom or
Playwright) and `pdf.js` (visual output).

---

## Technical decisions

- **`node:sqlite` instead of `better-sqlite3`**: it ships with Node, so there is nothing to compile
  on Windows and `:memory:` comes for free in tests.
- **Express pinned at 5.2.1**: 5.3.0 had been published five days earlier, and a freshly released
  package has not yet passed the window in which most supply-chain attacks are caught and yanked.
- **Calculation engine shared** between server and browser, served from `/shared`, so the real-time
  preview and the stored value come from the same code.
- **Gross-up estimate**: service amounts are treated as the desired payout, and the invoice total is
  calculated as `payout / (1 - rate)`. The 6% rate is only an estimate and does not determine actual
  tax or client withholding obligations; confirm the applicable treatment with an accountant.
- **Database excluded from Git** (`.gitignore`): a versioned binary produces unresolvable conflicts
  and tends to accumulate real data. The file lives in the project folder but is never committed.
- **Amounts stored as `REAL`**: a production financial system should use integer cents. Floating
  point with rounding centralised in `round()` was kept for MVP simplicity — a known, accepted
  limitation.
- **jsPDF vendored** instead of loaded from a CDN, so PDF generation works offline.
- **No password recovery**: losing the password means losing access to that profile.

### Security boundaries of this environment

Authentication is real — server-side, hashed, revocable sessions — but the environment is a demo:
plain HTTP with no TLS, an unencrypted database on disk, and no rate limiting on sign-in. Production
use would require HTTPS, attempt throttling and a password policy. The sign-in screen states this.

### Known gaps

- **Code comments are still written in Portuguese.** For a portfolio read in English they should be
  converted too; this was left out to keep the translation diff reviewable.
- **Internal status keys remain in Portuguese** (`pendente`, `paga`) in the database and in API
  responses; only the on-screen labels were translated. Changing the keys would require altering the
  `CHECK` constraint on the `invoices` table and migrating the existing database.
