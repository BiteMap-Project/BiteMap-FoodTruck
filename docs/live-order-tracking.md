# Live order tracking and ready-time estimates

Customers already receive automatic status updates every 10 seconds while an
active order page is visible. The page pauses when hidden, resumes immediately
when visible, backs off after failures, and stops polling after completion or
cancellation.

## Ready-time estimate

An operator can set or update an estimate while an order is `PLACED` or
`ACCEPTED`. The operator chooses 10, 15, 20, 30, 45, or 60 minutes from the
current time. The backend accepts any timestamp between 1 minute and 24 hours in
the future and protects the update with the order's current version.

Endpoint:

```text
PATCH /api/operator/vendors/{vendorId}/orders/{orderId}/estimate
```

Request:

```json
{
  "estimatedReadyAt": "2026-10-28T19:30:00Z",
  "version": 2
}
```

The estimate is returned in customer and operator order responses as
`estimatedReadyAt`. Customers see it while the order is placed or accepted.
Ready, completed, and cancelled orders keep the stored value for history but do
not present it as a future promise.

The estimate is informational. It does not change the scheduled pickup stop or
automatically advance order status.
