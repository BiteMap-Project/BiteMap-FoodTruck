package com.Bitemap.Backend.order;

import com.Bitemap.Backend.auth.AccountPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
public class OrderEventController {
    private final OrderEventStreams streams;
    public OrderEventController(OrderEventStreams streams) { this.streams=streams; }
    @GetMapping(value="/api/operator/vendors/{id}/order-events",produces=MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> owner(Authentication authentication,HttpServletRequest request,@PathVariable long id) {
        return stream(authentication,request,id,true);
    }
    @GetMapping(value="/api/customer/orders/{id}/events",produces=MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> customer(Authentication authentication,HttpServletRequest request,@PathVariable long id) {
        return stream(authentication,request,id,false);
    }
    private ResponseEntity<SseEmitter> stream(Authentication authentication,HttpServletRequest request,long id,boolean owner) {
        try {
        var emitter=streams.open((AccountPrincipal)authentication.getPrincipal(),request.getSession(false),id,owner);
        // Only an already-authorized stream may finish an ASYNC dispatch after logout.
        request.setAttribute("bitemap.authorized-order-stream",Boolean.TRUE);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Accel-Buffering","no")
            .body(emitter);
        } catch(org.springframework.dao.DataAccessException exception) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"Order updates are temporarily unavailable.");
        }
    }
}
