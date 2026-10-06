# Operational analytics

The truck analytics page at `/analytics` reads summary data from `GET /api/analytics/trucks`.
It gives the team a simple reporting dataset without exposing operator accounts or password data.

Each truck row includes its category and location, menu totals, available menu items, average menu
price, total stops, upcoming stops, and next stop time. Upcoming stops are scheduled or serving stops
whose end time has not passed.

The endpoint is read-only and public because it uses the same public truck, menu, and schedule data
as consumer discovery. The query keeps trucks with no menu items or stops, returning zero counts and
null for missing averages and dates.
