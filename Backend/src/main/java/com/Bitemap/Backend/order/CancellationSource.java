package com.Bitemap.Backend.order;

/** The action that cancelled an order, not the current roles of its actor. */
public enum CancellationSource {
    CUSTOMER, OWNER, ACCEPTANCE_TIMEOUT;

    static CancellationSource fromDatabase(String value) {
        return value == null ? null : valueOf(value);
    }
}
