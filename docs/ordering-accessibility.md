# Ordering accessibility audit

Scope: shared customer navigation, menu quantities, cart/checkout/recovery,
tracking/cancellation, customer pickup code, and owner pickup verification.
This is a focused audit, not certification of the whole application.
No pricing, authorization, order-state, idempotency, or database rules change.

## Reproduced defects and corrections

| Defect | Impact | Correction / regression |
| --- | --- | --- |
| Add/remove replaced the focused menu button | Keyboard users lost their position | Focus the remaining item control, or its heading; menu component regression |
| Cart removal had no focus destination | Focus fell back to the document | Next/previous quantity, or empty-cart heading; component regressions |
| Cart quantity label was visually hidden | Users could not see a persistent field label | Visible label and stronger select boundary |
| Inline cancellation replaced its trigger without focus handling | Confirmation or result was difficult to locate | Focus confirmation heading, restore trigger on Keep, focus latest status when focused panel disappears |
| Skip target was not focusable; route transitions stayed in navigation | Repeated navigation was needed to reach content | Focusable skip target; content focus on pathname change only |
| Delayed route focus raced with the next Tab | Focus could leave a quantity field just reached by keyboard | Synchronous layout-phase menu cleanup/content focus; narrow-screen real-keyboard regression |
| Menu copy contrast measured 4.27:1 and count 3.6:1 | Small text below AA threshold | Darker scoped colors; real-browser axe regression |
| Owner sidebar label/tip measured 3.95:1 / 4.05:1 during pickup scan | Small text below AA threshold | Scoped darker text, without altering layout |
| Accessible Add label did not contain visible “Add to cart” phrase | Voice-control label mismatch | “Add to cart: [product]”; updated selectors |
| Pickup code used an aria-label on a generic strong element | Digit pronunciation was not reliably exposed | Visible digits plus separate screen-reader digit text |
| Owner code instructions were not associated | Code-entry requirements easy to miss | Described-by hint, associated action error, stronger input boundary |

## Local verification record

- 418 frontend tests passed across 51 files.
- Production build and E2E TypeScript checks passed.
- Lint completed with four existing warnings in unrelated map, legacy dashboard,
  and schedule files; no lint errors.
- The final full 15-test isolated browser suite passed in 1.8 minutes, including
  accessibility scans, the small-phone quantity layout, and synchronous route
  focus. Its disposable containers and network were successfully removed.
- Screenshot review covered narrow-phone checkout errors and the owner code
  verification form. The test stack was disposable, not the application DB.
- The user explicitly deferred manual VoiceOver and real 200% zoom checks on
  November 18, 2026. Those are **untested**, not passed. CI is also pending a
  future push; nothing was committed or pushed by this audit.

## Verification matrix

“Automated” below is not a claim of screen-reader usability. Rerun commands
after any subsequent changes.

| Acceptance group | Coverage | Remaining manual work |
| --- | --- | --- |
| A: Tab/Shift+Tab, standard controls, sensible focus, mobile open/close, no trap | Existing mobile keyboard test; shared-navigation test; real Tab traversal through checkout, cancellation and pickup; focus regressions | Visual inspection of every focused state with Safari/VoiceOver |
| A: focus after removal/navigation; background updates | Menu/cart/cancellation unit tests; route focus browser assertion; status update focus-preservation assertion | Confirm spoken context after transitions |
| B: product labels, quantities, bounds, sold-out text, empty cart, locks | Menu/cart tests; meaningful status feedback; min/max description; existing checkout lock tests | Listen to first add and repeated changes |
| C: labels, errors, progress, preserved inputs, unknown outcome and recovery | Action-error focus; live submission text; real committed-but-lost-response flow; recovery uses original key | Listen to errors and recovery explanation |
| D: consequence, confirmation, pending, conflict, success | Cancellation unit and real-browser regressions, including stale update and duplicate request coverage | Confirm announcement sequence is understandable |
| E: stable status, progress text, digit text, paste-capable code input, errors, collection | Stable-live-region test; digit text assertion; labeled plain-text input; real wrong-code rejection and successful verified collection | VoiceOver digit pronunciation, paste, error and session-expiry announcements |
| F: text contrast and semantic states | axe WCAG A/AA scans for navigation, menu, checkout, recovery, tracking, cancellation and owner verification | Non-text/focus/selected boundaries require visual review; axe is not exhaustive |
| F: reflow / touch | Automated 320px and 640px reflow plus existing phone/tablet tests; primary quantity/remove controls 44px | Real 200% browser zoom remains separate and required |
| Full isolated order journey | `npm run test:e2e` uses random disposable PostgreSQL/Compose project | CI must pass on the submitted branch before merge |

## Commands

Run from `frontend`:

```sh
npm ci
npm test
npm run lint
npm run build
npm run test:e2e:typecheck
npm run test:e2e
```

The browser runner creates and removes only its own randomly named
`bitemap-e2e-xxxxxxxx` stack. Never point these fixtures at the application DB.
`@axe-core/playwright` is development-only. No accessibility runtime dependency
is added to the production bundle. Scans intentionally do not disable rules or
exclude failed controls. The owner dashboard outside pickup verification is
not a full manual audit target.

## Manual release checklist (not yet signed off)

1. Safari + VoiceOver: enable VoiceOver, navigate by landmarks/headings, then
   operate menu, cart, checkout recovery, cancellation and pickup. Confirm each
   digit including an initial zero; ensure polling doesn't repeat unchanged
   status. Check incorrect code and expired-session paths. Record OS/browser
   versions and actual speech results.
2. Chrome and Safari: set actual browser zoom to **200%** using browser controls,
   not CSS zoom, device scale, or viewport resizing. Check each page and pending,
   error and confirmation state. No clipped controls, overlap or hidden focus.
3. Repeat keyboard-only at 320 CSS pixels. Check Shift+Tab, Escape, skip link,
   drawer scrolling, and focus after navigating Back. Confirm content remains
   usable at increased text spacing.
4. Record any exception with reproduction, impact and ownership. Do not mark
   the story fully accessibility-verified while these manual checks are open.

## Separate dependency follow-up

During this work npm audit reported six high-severity entries in the existing
Vite/Vitest toolchain, rooted in picomatch (GHSA-fc5q-39xc-vjpf). Axe was not the
reported vulnerable dependency. Review a compatible upgrade separately; no
`npm audit fix --force` or unrelated major upgrades were applied here.

References: [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/)
and [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing).
Automated tools cannot establish full WCAG conformance. 44px is our preferred
target size, not a blanket statement of WCAG AA's minimum.
