package com.Bitemap.Backend.order;

public enum OrderStatus {
    PLACED, ACCEPTED, READY, COMPLETED, CANCELLED;

    public boolean canTransitionTo(OrderStatus next) {
        return switch (this) {
            case PLACED -> next == ACCEPTED || next == CANCELLED;
            case ACCEPTED -> next == READY || next == CANCELLED;
            case READY -> next == COMPLETED;
            case COMPLETED, CANCELLED -> false;
        };
    }
}
