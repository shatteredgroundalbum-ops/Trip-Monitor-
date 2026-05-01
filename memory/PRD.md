# RTI Trip Management — PRD

## Original Problem Statement
Mobile-first web app for a single truck driver at Riverside Transport Inc. (RTI) to
digitally fill RTI trip sheets and export them as JPEG, PDF, or email. Must replicate
the physical RTI paper trip sheet layout exactly for the export.

## Architecture
- **Backend:** FastAPI (`/api` prefix), MongoDB via motor, Emergent Google OAuth.
- **Frontend:** React 19 + React Router 7 + Tailwind + Shadcn UI + lucide icons.
- **Export:** html2canvas + jsPDF (mailto for email).
- **Persistence:** MongoDB (profile, sessions, learning dictionaries).

## User Persona
Single professional truck driver operating out of an RTI terminal; uses the app
in-cab on mobile to log each stop and export the trip sheet at end of run.

## Core Requirements (static)
1. Google auth (Emergent OAuth)
2. One-time driver profile setup (auto-fills Driver ID forever)
3. Session wizard: Previous/New/Future → Store / Warehouse(Dairy|Water) → Order#/BOL#
4. 8-row trip sheet table with dropdowns + tooltips + auto-save
5. City/State learning + trailer# learning + location learning
6. Temperature stepper (30–45°F) with 42°F+ red warning (dairy/store only)
7. Road Expenses (5 rows) + Notes (always on form)
8. Paper preview (pixel-replica) + Finish→Export multi-select (JPEG + PDF + Email)
9. Auto-save; "Continue current session?" on app re-open

## What's Been Implemented (2026-02)
- ✅ Backend: auth (session/me/logout), profile CRUD, trip-sessions CRUD,
  locations/trailers/cities learning endpoints (bump counters).
- ✅ Frontend: Welcome → CreateAccount/Login split flow, AuthCallback, redesigned
  Dashboard (stats + active trip + recent trips), DriverProfileDialog,
  SessionWizard (3-step), PaperSheet (replica), FinishExportDialog with
  JPEG/PDF/Print/mailto and 0–100% progress, preview modal, continue prompt,
  Trip Monitor splash video, long-press row duplicate.
- ✅ TripSheetForm refactored to a **progressive 1-stop-at-a-time wizard**
  (2026-02-?? fork): activeRowIndex driven, "Continue/Back" buttons, completed
  stops collapse into tappable summaries, future stops hidden until reached,
  stepper dots 1–8, auto-save unchanged, exported PaperSheet still renders all
  8 rows. Resolves prior accordion expansion bug.
- ✅ **Role-based driver onboarding (2026-02-?? fork)**:
  - New `RoleSelection` entry screen with 3 role cards: Company Driver,
    Owner-Operator (O/O), Lease-to-Purchase Operator (LTO).
  - Selected role persists in localStorage and posts to new
    `POST /api/auth/role` endpoint after Emergent OAuth callback;
    `User` model now carries optional `role`.
  - Login + CreateAccount pages display a role chip + `Change role` back link.
  - DriverProfileDialog rewritten into 3 NEW steps:
    1. Personal info (Full Name *, optional Address/City/State/ZIP/Phone)
    2. Driver info (Permanent vs Slip-Seating, Company ID, Truck Make from
       list of 10, Truck Color swatch picker w/ "Other" free-text, Truck #,
       License Plate)
    3. Experience & milestones init (Years driving + Lifetime miles)
  - Backend `DriverProfile` accepts the new fields + legacy `Slip-Seating`
    alias (normalised to `Slip Seat`). Years/miles validated 0–80 / 0–20M.
  - `total_trip_miles` (round-trip) is now a REQUIRED field at the top of
    the trip workflow (visible card with `data-testid='trip-miles-card'`).
    Backend rejects `POST /trip-sessions/{id}/finish` with 422 when missing/0.
    Dashboard finish button is disabled + shows `finish-miles-warning` until
    the value is positive; auto-save persists it via the existing PUT.
  - `/api/stats` extended with `miles_today`, `miles_in_app`, `miles_lifetime`
    (= profile baseline + sum of finished trip miles).
  - New `/api/achievements` endpoint computes 20 deterministic badges from
    profile + finished trips: 7 mileage tiers (100K…5M), 7 service-year tiers
    (1…30), 6 trip-count tiers (10…1000). Surfaced on Dashboard via the
    new `AchievementsPanel` component (earned medals + locked progress bars,
    "Show all" toggle).
  - Dashboard stats reshuffled to lead with **Miles today** + **Lifetime
    miles** + Total stops + Current truck. Role chip rendered next to
    "Dashboard" overline.
  - PaperSheet gained a "Total Miles" row in the driver info box so the
    exported document also carries the round-trip mileage.
- ✅ **PWA + Dashboard polish (2026-02-?? fork — iter 8)**:
  - Manifest upgraded with proper 192×192 + 512×512 icons, theme color
    aligned to brand orange, plus app shortcuts ("Start a new trip",
    "Trip history") so Android long-press the home-screen icon offers
    them.
  - Service worker bumped to `trip-monitor-v2` (cache invalidation),
    network-first /api/ GETs with cache fallback, cache-first static
    shell, navigations fall back to cached SPA shell when offline.
    Registered only in production builds.
  - New `<InstallPrompt />` listens to `beforeinstallprompt` and offers a
    one-tap install card; falls back to step-by-step iOS Safari
    instructions when the native event isn't available. Auto-hides if the
    app is already installed (display-mode: standalone) or recently
    dismissed (7-day cooldown via `tm_install_dismissed_at`).
  - New global `<OfflineBanner />` mounted in App.js — sticky orange bar
    when `navigator.onLine === false`, auto-replaces with a brief blue
    "Back online — syncing" pulse on reconnect.
  - New `GET /api/stats/week` endpoint returns 7 daily buckets oldest →
    newest in the user's profile time_zone (falls back to UTC), each
    with `{date, label, is_today, miles, trips}` plus totals
    (`miles_total_7d`, `trips_total_7d`, `miles_max`).
  - New `<WeeklyTrend />` mini-chart on the Dashboard renders pure-CSS
    7 bars; today highlighted in brand orange, other days blue, empty
    days a faint dashed outline. No charting libraries. Tooltip per bar.
  - Backend tests: 5/5 PASS in
    `/app/backend/tests/test_iter8_pwa_weekly.py`. iter 7 regression
    still 19/19 PASS.
- ✅ **Trip Recap & Mileage Tracking modes (2026-02-?? fork — iter 9)**:
  - Onboarding step 3 now picks mileage tracking method:
    `workflow` (free / default — driver types one round-trip total) or
    `segment` (premium — per-stop "miles since previous stop", auto-summed).
  - DriverProfile gained `mileage_mode`, TripRow gained `segment_miles`.
    `/profile` validates the mode (workflow|segment, else 422).
  - TripSheetForm is mode-aware: workflow renders the single big number
    input, segment turns the top card into a read-only running total and
    surfaces a `segment_miles` input on each active row card. Active-row
    summaries propagate the running sum back to `total_trip_miles`.
  - `/finish` auto-uses the sum of `rows[].segment_miles` as the saved
    `total_trip_miles` when (a) profile.mileage_mode='segment' AND (b) the
    explicit total is missing/0. Workflow mode still requires the explicit
    total. Stores `mileage_mode_at_finish` for auditability.
  - New `GET /trip-sessions/{id}/recap` (finished trips only — 404 on
    unfinished/missing) returns `{trip_miles, career_before, career_after,
    miles_today, miles_week, next_milestone:{label,threshold,remaining,
    progress_pct}, new_badges[], trips_total, mileage_mode}`.
    "New badges" are precisely those that flipped earned by THIS trip.
  - New `<TripRecap />` celebration modal pops automatically once
    FinishExportDialog hits 100%. Shows this trip's miles, career
    before→after with arrow, today/week tiles, next-milestone progress,
    and any badges unlocked this trip. Internal-only — never exported.
  - **PRIVACY rule honored**: removed the "Total Miles" row from
    `PaperSheet`. `total_trip_miles` is now strictly internal — never on
    JPEG/PDF/print/email outputs. Verified by automated assertion against
    `paper-sheet` innerText.
  - Backend tests: 9/9 PASS in
    `/app/backend/tests/test_iter9_mileage_recap.py`. iter 7 + iter 8
    regression still 24/24 PASS. Frontend e2e 14/14 PASS.
- ✅ **Dynamic Trip Sheet — Batch 1 (foundation, hidden)** (2026-02-?? fork — iter 10):
  - Decisions locked in by user spec: Tesseract.js (free, browser-only,
    offline-capable), local-first IndexedDB storage, NO UI surfaced yet,
    tap-to-assign mapping deferred to Batch 2.
  - Deps: `tesseract.js@7.0.0`, `localforage@1.10.0`.
  - `template-types.js`: model + 13-field `PRESET_FIELDS` catalog.
  - `template-store.js`: localforage CRUD + active-template pointer.
  - `scan-pipeline.js`: `normalizeCapture` downscales to ≤1600 px JPEG,
    `runOcr` runs Tesseract v7 via `createWorker` with jsdelivr CDN and
    `cacheMethod:'write'` — 4-strategy word extraction fallback
    (data.words → blocks → TSV → hocr regex) since v7 omits words by
    default.
  - Hidden harness `/dev/template-lab` (not linked anywhere).
  - Privacy: zero uploads. Everything stays on device.
- ✅ **Dynamic Trip Sheet — Batch 2 + Batch 3 (surfaced + integrated)** (2026-02-?? fork — iter 11):
  - **Mapping system**: new `<TemplateMappingWizard />` walks the driver
    through the 13-field `PRESET_FIELDS` catalog. Tap-to-assign UX only
    (no drag). Each tap anchors a numbered pin at the normalized (x, y)
    on the scan; driver can undo, skip (optional-by-default), or go
    back. Progress bar + "Step X / 13" overline + live "N mapped" count.
    On finish the updated template is persisted to IndexedDB and set as
    the active template.
  - **Surfaced flow**: new user-facing `/templates` route with 3 steps
    — Pick (Use TripMonitor default OR Scan my company sheet) → Capture
    (camera or upload, downscale, optional OCR pass) → Map (the wizard
    above). Entry from Dashboard header action (file icon next to
    history). Stored-templates list with per-template Activate / Delete
    controls and active-template highlight. Honors the "multiple
    templates increase storage" confirmation rule.
  - **Default template seed**: new `ensureDefaultTemplate()` helper
    creates a "TripMonitor Default" record with a stable id on first
    run and auto-activates it so the runtime always has something
    to render. Idempotent — never overwrites a driver's active choice.
  - **Runtime replacement**: new `<DynamicPaperSheet />` branches
    by `template.source`. For `default`, it delegates to the existing
    legacy `PaperSheet` (RTI layout, zero behaviour change). For
    `scanned`, it renders PHOTOGRAPHIC MODE — the scan as a 900-px-wide
    background `<img>` with typed trip values absolutely-positioned at
    each field's normalized coordinates in dark-navy Arial. FinishExportDialog
    + Dashboard preview modal now consume `<DynamicPaperSheet>` with
    `template={activeTemplate}`. html2canvas → JPEG/PDF/email works
    unchanged because the DOM shape is the same.
  - **Privacy preserved**: `ScannedPaperSheet` intentionally ignores
    `total_trip_miles` / `segment_miles` — mileage remains internal-only
    across both default AND scanned exports.
  - **Re-scan flow**: "Change template" in `/templates` Stored-templates
    list. Drivers can Activate any stored template (switching the
    runtime instantly) or Delete (except the built-in default).
  - **Validated end-to-end**: pick-scan → synthetic 800×400 company
    sheet → OCR skipped → storage-warning confirm → mapping wizard
    pinned 4 fields + skipped 9 → finish → back to Dashboard → preview
    modal rendered ScannedPaperSheet with 3 value overlays + 1 scan
    image child, confirming photographic mode is the active runtime
    path. IndexedDB persistence across navigations verified. Backend
    still 401s unauth on all 4 probed endpoints.
  - Decisions locked in by user spec: Tesseract.js (free, browser-only,
    offline-capable), local-first IndexedDB storage, NO UI surfaced yet,
    tap-to-assign mapping deferred to Batch 2, default RTI sheet stays
    untouched.
  - Added deps: `tesseract.js@7.0.0`, `localforage@1.10.0`.
  - New `template-types.js`: `TripTemplate` data model with
    normalized 0..1 field coordinates, `PRESET_FIELDS` catalog (13
    fields the future mapping wizard will walk through), UUID helper.
  - New `template-store.js`: localforage-backed CRUD (saveTemplate,
    getTemplate, listTemplates, deleteTemplate, getActiveTemplate,
    setActiveTemplateId, totalStorageBytes, _DEV_clearAll).
  - New `scan-pipeline.js`: `normalizeCapture()` downscales captures to
    ≤ 1600 px max-edge JPEG (≤ ~350 KB typical), `runOcr()` lazily
    imports Tesseract via `createWorker('eng', 1, {…})` against jsdelivr
    CDN with `cacheMethod: 'write'` so first run downloads ~10 MB
    `eng.traineddata` and subsequent runs (and offline use) load from
    cache. Word-level data parsed via 4 fallback strategies
    (data.words → blocks tree → TSV → hocr regex) since v7's
    default JSON omits words.
  - New hidden harness route `/dev/template-lab` (NOT linked from any
    visible nav). Exposes capture → normalize → OCR → save → list flow.
    Verified end-to-end: synthetic 800×240 sheet OCR'd 8 words at 95%
    avg confidence with bbox overlay rendered on the preview;
    IndexedDB persistence holds across reloads; storage indicator
    accurate; honors the "Multiple templates take more storage"
    confirmation.
  - Privacy: nothing is uploaded. All scans + OCR stay on device.
  - No backend changes. Prior auth/stats/recap/achievements endpoints
    still 401 unauth, regression unbroken.
- ✅ Pre-seeded major US cities/states + 10 event codes + 5 trailer types.

- ✅ **Pro Mapping Editor — Delivery 1** (2026-02-?? fork — iter 10):
  - New `<ProMappingEditor />` (725 LoC) — stylus-AND-finger visual
    annotation canvas with SVG overlay. 6 markup primitives shipped:
    point / circle (drag) / box (drag) / 4-corner rectangle /
    line+label (2-tap binding) / sequential (n-tap series). All
    committed elements normalized 0..1 to the scan dimensions.
  - `Snap + Lock` heuristic via new `snapToNearestWord()` helper
    (template-types.js) — taps within 28 px of an OCR word corner
    are pulled onto that corner; finger taps use 28 px, stylus taps
    18 px. Toggleable via `pro-mapping-snap-toggle`.
  - Right-side 3-tab inspector (Schema / Form / Preview):
    - Schema : live element list with kind icon + label + geometry summary
    - Form   : blank-form reconstruction drawn purely from coords
    - Preview: photographic export preview via DynamicPaperSheet
  - Undo (single-level) pops the latest draft or last committed
    element. Multi-tap tools (corners, sequential) have an explicit
    Commit button so the driver can finalize before running out of
    taps.
  - `TemplateSetup.jsx` now surfaces a `mapmode-picker` between the
    capture step and the mapping step so the driver picks between
    Quick Map (13-tap preset walk) and Pro Mapping (free-form
    markup) — "progressive disclosure" per user spec.
  - `DynamicPaperSheet.jsx` synthesizes a `fields{}` map on the fly
    from `template.schema.elements[]` (line_label + point kinds)
    so the photographic export renderer stays single-path — the
    exporter doesn't care which mapping flow produced the template.
  - Fixes during validation:
    1. React hooks-order bug (useMemo after early-return) → early
       return moved below all hooks.
    2. `handleContinueToMap` no longer persists the template before
       mapping — Finish step in each editor is now the single save
       point so a cancelled flow doesn't orphan a zero-field template
       in IndexedDB.
    3. Circle tool: a tap without drag no longer commits an
       accidental default-radius circle (gated on `dragged` flag).
  - Privacy: mileage still never renders in Preview / export.
  - Tested 19/19 PASS via testing_agent_v3_fork (iter 10).

## Prioritized Backlog
- P1: Pro Mapping Editor — Delivery 2
   - Validation pass (flag missing required fields, overlapping
     boxes, out-of-bounds coords) before allowing Finish.
   - Multi-select + move + scale of already-drawn elements.
   - Deep undo/redo stack (current is single-level).
   - Split ProMappingEditor.jsx (725 LoC) into
     ProMappingEditor.jsx + ProMappingOverlays.jsx + ProMappingPanes.jsx
     — natural boundaries at overlay renderers and right-pane
     renderers.
   - Smart field-suggestion pass — pre-anchor Order #, Driver,
     BOL, Date, etc. from OCR labels so typical driver tap count
     drops from 13 → ~3.
   - Graceful fallback when a Pro-Mapping label doesn't match a
     preset key — render the unmapped label as placeholder text
     at the anchor so the driver sees WHERE it will print.
- P1: Real social-login OAuth wiring (Facebook / Instagram / LinkedIn) — currently UI placeholders
- P1: Replace QR placeholder with real GoDriver install QR
- P2: Cloud backup for templates (Google Drive / OneDrive — driver opt-in)
- P2: Multi-page trip envelopes (stage-2 scan → secondary template)
- P2: History screen to re-open finished sheets
- P2: Automatic email attachment via backend (SendGrid/Resend)
- P2: Company / Admin onboarding flow (multi-tenant)
- P2: "Trip recap" shareable PNG card (miles + badges) for social sharing
- P2: Refactor `/app/backend/server.py` into sub-routers (~890 lines)
