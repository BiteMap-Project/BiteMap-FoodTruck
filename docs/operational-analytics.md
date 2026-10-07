# Operator business insights

`/operator/analytics` reports only the signed-in operator's trucks. `/analytics`
redirects to that page for old bookmarks. Anonymous visitors are sent to operator
sign-in. Public discovery and public truck menus still require no account.

## Access and data contract

GET `/api/operator/analytics/trucks` requires an enabled operator account and returns
`Cache-Control: no-store`. The backend resolves the owner from the authenticated
session and filters `vendors.operator_id`; it never accepts a caller-selected owner.
The former public `/api/analytics/trucks` endpoint has been removed. Unowned sample
trucks belong to no operator and do not appear in any operator's business report.

The page initially shows all owned trucks. Selecting one truck updates the cards,
table, and CSV to that truck. A new operator starts with zero trucks and a prompt
to create one. Creating a truck in `/operator` sets ownership on the server.

These metrics describe menu and schedule activity. No orders, sales, revenue,
profit, or customer analytics are collected or implied by this report.

## Reporting dictionary

The response includes `trucks` (one row per owned truck), and totals:
`totalTrucks`, `totalMenuItems`, `availableMenuItems`, `upcomingStops`.

| Row field | Type | Meaning |
| --- | --- | --- |
| vendorId | integer | Truck primary key, not an operator ID |
| name / category / location | text | Public truck profile fields |
| menuItemCount | integer | All menu states counted once |
| availableItemCount | integer | Items whose status is ACTIVE |
| averageMenuPrice | decimal or null | Mean USD price of all menu items, rounded to two decimals; null if no menu |
| totalStopCount | integer | All dated stops, including cancelled and ended |
| upcomingStopCount | integer | Scheduled or serving stops with end time after the query time, including ongoing stops |
| nextStopAt | UTC timestamp or null | Earliest start among those upcoming/ongoing stops; can be in the past for an ongoing stop |

Menu and stop aggregates are calculated separately before joining so multiple
stops cannot multiply menu counts or distort averages. Missing counts are zero;
missing prices and times are null. No operator emails or password hashes are read
into the report.

## CSV

Export uses the current owned-truck selection, not the public vendor list. Dates
are UTC in the CSV; the page renders them in the viewer's local timezone. Missing
prices and dates are blank. Text is CSV-escaped with formula-like prefixes guarded.
Download and reopen the CSV in your usual browser and spreadsheet tool during the
rehearsal; content tests alone do not prove every browser's download behavior.

## Verification

Analytics API tests cover two separate owners, unowned fixtures, anonymous and
wrong-role access, disabled/deleted accounts, ignored owner query parameters,
empty accounts, no-store headers, averages with repeated prices, and multiple stops.
The operator walkthrough integration test registers an account, logs in, creates a
truck, adds a menu item, reads it anonymously, checks private analytics, and logs out.
All test writes use an isolated PostgreSQL database and are rolled back.

See [the professor walkthrough](professor-demo.md) for the live demo and Jira updates.
