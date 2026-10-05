package com.Bitemap.Backend.menu;

public enum MenuAvailability {
    ACTIVE, INACTIVE, SOLD_OUT;

    @com.fasterxml.jackson.annotation.JsonCreator
    public static MenuAvailability fromJson(String value) {
        // Reject numeric enum ordinals; the wire contract uses explicit state names.
        return valueOf(value);
    }
}
