<!--
  Generated with AppStarter.ai (appstarter.ai/wizard) on Nov 4, 2026, during the Company Brain Hackathon.
  Wizard choices: Web app · Vanilla HTML/JS · Python + FastAPI · No database · brief = Handoff Brain.
  Used as the build checklist for Handoff Brain and the plan for its next iteration.
  Note: the shipped hackathon build uses a zero-dependency Python standard-library server instead of FastAPI.
-->

# 🎯 GOAL

Build **Handoff Brain** — when an onboarding consultant leaves, a teammate inherits their customer accounts. The app reads every call transcript per account and builds a one-page handoff card: health (red/amber/green) with a one-sentence reason, onboarding journey (Kickoff, Data sync, Texting registration, Number port, Phone install, Training, Check-ins) with done/in progress/blocked, risks, promises made on calls with exact quotes as receipts (flag overdue ones), and a next-call checklist. Features: a floating chat bar that answers only from that account's calls with a quote; a 60-second voice briefing via ElevenLabs; paste a new transcript to rebuild the card live; a CRM-ready Salesforce note; Triggerware standing triggers for at-risk accounts and open promises. Demo data is fictional.

Stack: **HTML5 + Vanilla JavaScript (ES2022 modules) + CSS3 (custom properties, container queries)**.
Persistence: **None**.
Auth: **none** (Web Crypto API + Fetch).

Reference files attached in AppStarter: `1-intro.png`, `2-reading.png`, `3-handoff-card.png` (see `shots/`).

Target browsers: **modern evergreen (last 2 versions)** — no transpiler, no bundler unless feature-required.

---

# 🏛️ ARCHITECTURE (Clean / Layered, framework-free)

```
┌──────────────────────────────────────────────────────────┐
│ 1. PRESENTATION                                          │
│    index.html + <template> tags + ./views/*.js modules   │
│    that mount/unmount fragments. CSS scoped per view.    │
├──────────────────────────────────────────────────────────┤
│ 2. VIEW MODELS                                           │
│    ./controllers/*.js — handle DOM events, call use      │
│    cases, render results. One per view.                  │
├──────────────────────────────────────────────────────────┤
│ 3. DATA                                                  │
│    ./data/repositories/*.js — fetch() HTTP wrappers.     │
├──────────────────────────────────────────────────────────┤
│ 4. DOMAIN                                                │
│    ./domain/{entities,use_cases,repositories}/*.js —     │
│    pure JS, no DOM, no fetch.                            │
├──────────────────────────────────────────────────────────┤
│ 5. STORAGE                                               │
│    Adapters around localStorage / IndexedDB.             │
└──────────────────────────────────────────────────────────┘
```

DI: `./composition-root.js` builds repositories + use cases at boot, exports a single `app` object the controllers import.

---

# 📁 EXPECTED FOLDER STRUCTURE

```
public/
├── index.html
├── styles/
│   ├── tokens.css        # custom-property design tokens
│   └── views/*.css
├── js/
│   ├── presentation/{views,components}/
│   ├── view_models/
│   ├── data/{repositories/,dtos.js}
│   ├── domain/{entities,use_cases,repositories}/
│   ├── storage/
│   ├── composition-root.js
│   └── main.js
└── tests/*.test.js        # node --test
```

---

# ✅ GENERATION CHECKLIST (per feature)

1. Entity + repository interface + use case in `domain/`.
2. Repository impl in `data/repositories/` (fetch + JSON).
3. Storage adapter in `storage/` if local.
4. Controller in `view_models/` that subscribes to events + calls use case.
5. View module in `presentation/views/` with a `<template id="…">`.
6. CSS file in `styles/views/`.
7. Tests with `node --test` for use cases.

---

# 🧪 NON-FUNCTIONAL

- No build step by default. Use `<script type="module">` and import-maps.
- CSS via design tokens (`:root { --color-fg: … }`), no preprocessor.
- Semantic HTML + a11y (landmarks, ARIA where needed).
- Lighthouse target: Perf ≥ 95, A11y ≥ 95.
- Service worker for offline (cache-first for static, network-first for API).

---

# 🔒 SECURITY (applied by default)

- Never commit secrets. Credentials come from environment variables; `.env.example` is committed, `.env` is gitignored.
- Validate every external input at the boundary; output-encode by context; cap request body sizes.
- Security headers (CSP, nosniff, Referrer-Policy, Permissions-Policy, frame-ancestors). HTTPS only when deployed.
- Outbound HTTP from the server goes through an allow-listed client (SSRF).
- Do not log secrets, tokens, full request bodies, or PII.
- Pin dependencies; audit in CI. Add `SECURITY.md`.

---

# 🧪 TESTING

- Unit-test the domain layer with fakes.
- One end-to-end test per critical flow (read accounts → handoff card; add transcript → card updates).
- Coverage targets: `domain/` ≥ 90 %, overall ≥ 70 %. Deterministic, hermetic tests.

---

# 📊 OBSERVABILITY

- Structured JSON logs; latency and error-rate metrics per endpoint; error reporting with PII scrubbing; `RUNBOOK.md`.

---

# 🚫 PROHIBITIONS

- No frameworks (React, Vue, jQuery, etc.) — vanilla only.
- No DOM access in `domain/` or `data/`.
- No global state. No inline scripts in HTML.

---

# 🎯 ACCEPTANCE CRITERIA (written for the hackathon build)

> **GIVEN** a departing consultant's 5 accounts with call transcripts
> **WHEN** the new owner clicks "Read everything in 60 seconds"
> **THEN** each account shows a red/amber/green health with a one-sentence reason, and counts of risks, promises and overdue items appear

> **GIVEN** an at-risk account with an overdue promise
> **WHEN** the owner pastes a follow-up call transcript where the issue is resolved
> **THEN** the account's handoff card rebuilds and its health changes, with quotes from the new call as receipts

> **GIVEN** an account is open
> **WHEN** the owner asks a question in the chat bar
> **THEN** the answer comes only from that account's calls and shows the supporting quote

---

# ▶️ NEXT ITERATION (from this spec)

1. Split `handoff.js` into domain / data / view-model / view modules per the layered architecture.
2. Move the server to FastAPI with request validation and security headers.
3. Add `node --test` unit tests for the card-building and promise-overdue logic.
4. Service worker for offline viewing of cached handoff cards.
