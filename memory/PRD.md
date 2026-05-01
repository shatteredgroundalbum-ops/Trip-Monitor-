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
  - Backend tests: 19/19 PASS in
    `/app/backend/tests/test_iter7_role_achievements_miles.py`.
- ✅ Pre-seeded major US cities/states + 10 event codes + 5 trailer types.

## Prioritized Backlog
- P1: PWA install manifest + service worker for home-screen install + offline support
- P1: "This week" 7-bar mini-trend graph on the Dashboard
- P1: Real social-login OAuth wiring (Google works via Emergent OAuth; FB / IG / LinkedIn / Email-password remain UI placeholders that toast "coming soon")
- P1: Replace QR placeholder with real GoDriver install QR
- P2: History screen to re-open finished sheets
- P2: Automatic email attachment via backend (SendGrid/Resend)
- P2: Company / Admin onboarding flow (multi-tenant: company creation + branding upload + custom trip-sheet templates)
