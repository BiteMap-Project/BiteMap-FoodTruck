package com.Bitemap.Backend.order;

final class PickupCodeUnavailableException extends RuntimeException {
    PickupCodeUnavailableException() { super("Pickup verification is temporarily unavailable. No handoff was recorded. Please try again later."); }
}
