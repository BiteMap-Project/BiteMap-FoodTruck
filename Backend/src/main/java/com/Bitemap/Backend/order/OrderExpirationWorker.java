package com.Bitemap.Backend.order;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="bitemap.order-expiration.enabled",havingValue="true",matchIfMissing=true)
public class OrderExpirationWorker {
    private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(OrderExpirationWorker.class);
    private final OrderExpirationService expiration;
    private final MeterRegistry metrics;
    public OrderExpirationWorker(OrderExpirationService expiration, MeterRegistry metrics) {
        this.expiration=expiration; this.metrics=metrics;
    }
    @Scheduled(fixedDelayString="${bitemap.order-expiration.poll-ms:5000}",initialDelay=5000)
    public void poll() {
        try {
            for(int i=0;i<100 && expiration.expireOne();i++) metrics.counter("bitemap.orders.expired").increment();
            metrics.counter("bitemap.orders.expiration.poll.success").increment();
        } catch (RuntimeException exception) {
            metrics.counter("bitemap.orders.expiration.failures").increment();
            LOG.warn("Order expiration failed; the next scheduled poll will retry.");
        }
    }
}
