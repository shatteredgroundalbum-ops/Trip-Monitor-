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
- ✅ Pre-seeded major US cities/states + 10 event codes + 5 trailer types.

## Prioritized Backlog
- P1: Replace QR placeholder with real GoDriver install QR
- P1: History screen to re-open finished sheets
- P1: Real social-login OAuth wiring (Google / Facebook / Instagram / LinkedIn) — buttons exist as UI placeholders only
- P2: "This week" 7-bar mini-trend on dashboard
- P2: PWA install manifest for home-screen install
- P2: Offline support via service worker
- P2: Automatic email attachment via backend (SendGrid/Resend)
