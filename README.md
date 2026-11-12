# Expense Tracker with Analytics
React + Node + Express only (no database, no auth library). Data lives in memory and is re-seeded on every server start.

## Run
```
npm install
npm run serve        # builds React, then serves app + API on http://localhost:3000
```
Dev mode (two terminals): `npm run dev:server` and `npm run dev:client` (http://localhost:5173, proxies /api).
Tests: `npm test`. Currency: INR (₹).

Accounts: `demo@example.com / demo1234` (sample data) · `admin@example.com / admin1234` (admin role).

## API (all except auth/health need the Bearer token)
| Method | Path | Notes |
|---|---|---|
| POST | /auth/register, /auth/login | returns `{token, user}` |
| POST / GET | /auth/logout, /auth/me | |
| GET, POST, DELETE | /categories, /categories/:id | delete blocked if in use |
| GET, POST | /transactions | filters: `from`, `to`, `type`, `category`; recurring entries expand into occurrences |
| GET, PUT, DELETE | /transactions/:id | PUT accepts partial body |
| GET | /analytics/summary, /analytics/by-category, /analytics/monthly | `from`, `to` (by-category also `type`) |
| GET, PUT, DELETE | /budgets, /budgets/:category | category `ALL` = total monthly budget |
| GET | /alerts?month=YYYY-MM | status `ok` / `warning` (>=80%) / `over` (>100%) |
| GET | /insights?month=YYYY-MM | spending insights, category changes, month-end forecast |
| GET | /export/csv | `from`, `to`, `type`; downloads via `res.attachment` |
| GET | /admin/users | admin role only |

Transaction body: `{type: "income"|"expense", amount, category, date: "YYYY-MM-DD", note?, recurring?: "weekly"|"monthly", endDate?}`.
Errors are JSON: `{ "error": "message" }`.
