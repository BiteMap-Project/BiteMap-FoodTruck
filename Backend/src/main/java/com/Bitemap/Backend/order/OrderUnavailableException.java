package com.Bitemap.Backend.order;

public class OrderUnavailableException extends RuntimeException {
    public OrderUnavailableException() { super("One or more cart items are no longer available."); }
}
