/** Source is supplied by the authorized API. Never infer an actor from free-form reason text. */
export function cancellationMessage(source?: string | null): string {
  switch (source) {
    case 'CUSTOMER': return 'You cancelled this order.';
    case 'OWNER': return 'The truck cancelled your order.';
    case 'ACCEPTANCE_TIMEOUT': return 'The truck did not accept in time.';
    default: return 'Your order was cancelled.';
  }
}
