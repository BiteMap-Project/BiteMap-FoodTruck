# Operational analytics

The truck analytics page at `/analytics` reads summary data from `GET /api/analytics/trucks`.
It gives the team a simple reporting dataset without exposing operator accounts or password data.

Each truck row includes its category and location, menu totals, available menu items, average menu
price, total stops, upcoming stops, and next stop time. Upcoming stops are scheduled or serving stops
whose end time has not passed.

The endpoint is read-only and public because it uses the same public truck, menu, and schedule data
as consumer discovery. The query keeps trucks with no menu items or stops, returning zero counts and
null for missing averages and dates.

## CSV export

The **Export CSV** button downloads the current truck-level report for analysis in Excel, Power BI,
Tableau, or Python. Text values are quoted and escaped, and values that begin with spreadsheet formula
characters are stored as text. Missing prices and dates remain blank instead of being changed to zero.

## Demo flow

1. Start BiteMap with `docker compose up -d --build`.
2. Open the consumer homepage and show that the truck list comes from PostgreSQL.
3. Search for `Taco`, open Taco Mobile, and show its menu and availability.
4. Return home and open **Truck insights** from the sidebar.
5. Explain the four live totals and one truck row.
6. Select **Export CSV**, then open the file to show the same truck-level dataset.

This flow demonstrates one complete path from stored data, through the Spring Boot API, to the React
interface and an analysis-ready export.
