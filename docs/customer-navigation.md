# Shared customer navigation

Discovery, truck menus, cart, favorites, order history/tracking, and account settings share `CustomerLayout`. The existing account-keyed guards remain around private page content. Login, operator, and administrator pages retain their own layouts.

At widths up to 1000px the header shows the brand, cart quantity, and Menu button. The modal drawer closes on navigation, Escape, outside click, desktop resize, or account change. At larger widths navigation remains in the sidebar. `NavLink` marks the current section, including My orders on order-detail URLs.

The badge subscribes to the existing cart change event and reads the current cart; it does not create another cart, clear storage, or change a checkout attempt. Owner/admin links still depend on server-provided account roles. Existing backend authorization is unchanged.

## Manual verification

1. Add multiple quantities to a cart. Visit Cart, My orders, Favorites, Account settings, and a truck menu. The badge must show the summed quantity throughout.
2. At 375px and 768px, open Menu, select a link, and check the destination and active state. Tab/Shift+Tab stay inside; Escape restores focus to Menu. Scroll the drawer to reach settings and sign out.
3. At 1024px and 1440px verify the sidebar and no horizontal page overflow. Resize with the drawer open; scrolling must be restored.
4. Navigate Back/Forward and refresh on an order-detail URL. My orders remains the active section.
5. With an unresolved checkout, navigate away and return/reload. The recovery prompt, original snapshot, and retry key remain unchanged. Do not submit a new checkout to test navigation.
6. Switch accounts using another tab, then return to the first tab. Old account details and owner-only links must disappear; private order results must follow the existing account-aware guards. Sign out from a private page and confirm it redirects to sign-in.

`CustomerLayout.test.tsx` covers shared links, active states, role visibility, reactive quantities, and preserved checkout storage. `customer-navigation.spec.ts` adds browser focus, URL history, responsive layout, and account-switch coverage with mock responses. The existing isolated PostgreSQL ordering suite verifies real checkout and tracking.
