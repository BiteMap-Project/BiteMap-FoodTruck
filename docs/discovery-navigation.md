# Discovery URL state

Routes remain `/` (map), `/stops` (scheduled list), and `/trucks` (vendor list).
Shareable filters are `q`, `cuisine`, `when`, `from`, `to`, `page`, and `radius`.
Page is zero-based, bounded to 10000. Radius is miles: 1, 5, 10, 25, or 50.
Dates are valid YYYY-MM-DD dates. Invalid individual parameters use safe defaults;
incomplete, reversed, or overlong custom date ranges show validation rather than
sending an invalid request. Date windows use the viewer's local time zone.

Filter changes reset pagination. Map/list switching preserves stop pagination;
switching between vendors and stops resets it. Typing replaces the current history
entry; discrete filter and page selections push entries. Back/Forward and direct
URL loads restore controls and queries. Superseded requests are aborted.

Location coordinates are never written to URLs or persistent storage. Near-me
location is component-local and must be requested again after leaving discovery
or refreshing. A saved radius alone does not enable location or proximity filtering.

## Manual verification

1. Open `/stops`, select Open now, then open a truck's menu.
2. Use browser Back: Open now remains selected. Back again restores the previous
   filter; Forward restores Open now.
3. Select cuisine/custom dates and a later page. Refresh: the controls and results
   agree with the URL. Change a filter: pagination resets to the first page.
4. Switch Map / Schedule & nearby: filters and page remain consistent.
5. Try `/stops?when=invalid&page=-1&from=2026-02-30`: safe defaults, no crash.
6. Enable Near me: no latitude/longitude appear in the URL. Reload: location is
   not automatically requested or reused.

No backend contract, ownership, checkout, or saved pickup-location changes.
