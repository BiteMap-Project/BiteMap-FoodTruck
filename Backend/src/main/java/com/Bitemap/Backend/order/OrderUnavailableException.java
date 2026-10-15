package com.Bitemap.Backend.order;

public class OrderUnavailableException extends RuntimeException {
    public OrderUnavailableException(String detail) { super(detail); }
}
