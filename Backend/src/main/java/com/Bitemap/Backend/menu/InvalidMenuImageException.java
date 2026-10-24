package com.Bitemap.Backend.menu;

/** Only fixed, user-safe validation messages cross the API boundary. */
public class InvalidMenuImageException extends RuntimeException {
    public InvalidMenuImageException(String message) { super(message); }
}
