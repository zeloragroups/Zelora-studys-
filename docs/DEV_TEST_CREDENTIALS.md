# Development-Only Test Credentials (Phase 2)

> **Warning**: These credentials exist solely inside `src/services/local/localAuthService.ts` while Firebase Authentication is disconnected. They must never be shipped to production or exposed in public-facing UI.

## Demo Accounts

| Role | Portal Entry | Account ID | Dev Password | Expected Redirect |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `/admin/login` (or `/portal/login`) | `ADM-0001` | `Admin@2026` | `/admin/dashboard` |
| **Teacher** | `/portal/login` | `TCH-0001` | `Teacher@2026` | `/portal/teacher` |
| **Student (shared with Parent)** | `/portal/login` | `STU-0001` | `Student@2026` | `/portal/student` |
| **Inactive Student** | `/portal/login` | `STU-0099` | `Student@2026` | Blocked (`INACTIVE_ACCOUNT`) |

## Automatic Role Routing Verification
1. Open `/portal/login`. Notice there is **no** Teacher/Student dropdown.
2. Sign in with `TCH-0001` / `Teacher@2026` → automatically opens `/portal/teacher`.
3. Sign out → returns to `/portal/login`.
4. Sign in with `STU-0001` / `Student@2026` → automatically opens `/portal/student`.
5. Attempt to sign in at `/admin/login` with `TCH-0001` or `STU-0001` → blocked with Admin-only portal notice.
6. Attempt direct URL navigation (e.g., `/admin/dashboard` while signed in as `TCH-0001`) → blocked by `RouteGuard` with Access Restricted screen.
