package com.Bitemap.Backend.order;

import com.Bitemap.Backend.auth.AccountPrincipal;
import jakarta.annotation.PreDestroy;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** SSE transports current committed state, not an exactly-once event delivery protocol. */
@Service
public class OrderEventStreams {
    private final OrderSignalReader reader;
    private final int maxConnections;
    private final int maxPerUser;
    private final java.util.concurrent.Semaphore workerSlots;
    private final ConcurrentHashMap<SseEmitter,Connection> connections=new ConcurrentHashMap<>();
    // At most one worker per admitted connection. A slow client cannot block other streams or the scheduler.
    private final ExecutorService workers=Executors.newVirtualThreadPerTaskExecutor();
    public OrderEventStreams(OrderSignalReader reader,
            @Value("${bitemap.order-events.max-connections:200}") int maxConnections,
            @Value("${bitemap.order-events.max-per-user:6}") int maxPerUser) {
        this.reader=reader; this.maxConnections=maxConnections; this.maxPerUser=maxPerUser;
        this.workerSlots=new java.util.concurrent.Semaphore(maxConnections);
    }
    public SseEmitter open(AccountPrincipal principal, HttpSession session, long id, boolean operator) {
        var initial=reader.read(principal,id,operator); // Normal HTTP 404 before committing stream headers.
        var emitter=new SseEmitter(60_000L); // Rotate through normal HTTP authorization every minute.
        var connection=new Connection(emitter,principal,session,id,operator);
        synchronized(connections) {
            if(connections.size()>=maxConnections || connections.values().stream()
                .filter(c->c.principal.userId()==principal.userId()).count()>=maxPerUser)
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Too many update connections. Close unused tabs.");
            connections.put(emitter,connection);
        }
        emitter.onCompletion(()->connections.remove(emitter));
        emitter.onTimeout(()->{connections.remove(emitter); emitter.complete();});
        emitter.onError(error->connections.remove(emitter));
        try { emitter.send(SseEmitter.event().name("orders").reconnectTime(3000).data(initial)); }
        catch(IOException | IllegalStateException error) { connections.remove(emitter); }
        return emitter;
    }
    @Scheduled(fixedDelayString="${bitemap.order-events.tick-ms:3000}")
    void tick() {
        connections.values().forEach(c->{
            if(c.running.compareAndSet(false,true)) {
                if(!workerSlots.tryAcquire()) { c.running.set(false); return; }
                workers.execute(()->{
                try {
                    if(!currentSession(c)) { accessEnded(c); return; }
                    var signal=reader.read(c.principal,c.id,c.operator);
                    if(!currentSession(c)) { accessEnded(c); return; }
                    // Repeated snapshots double as heartbeats; the client deduplicates by revision.
                    c.emitter.send(SseEmitter.event().name("orders").data(signal));
                } catch(IOException error) {
                    connections.remove(c.emitter); // Servlet container completes failed socket writes.
                } catch(ResponseStatusException denied) { accessEnded(c); }
                catch(RuntimeException error) { close(c); }
                finally { c.running.set(false); workerSlots.release(); }
            });
            }
        });
    }
    static boolean currentSession(Connection c) {
        try {
            if(c.session==null) return false;
            int timeout=c.session.getMaxInactiveInterval();
            if(timeout>0 && System.currentTimeMillis()-c.session.getLastAccessedTime()>timeout*1000L) return false;
            var value=c.session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
            if(!(value instanceof SecurityContext context)) return false;
            var auth=context.getAuthentication();
            return auth!=null && auth.isAuthenticated() && auth.getPrincipal() instanceof AccountPrincipal p
                && p.userId()==c.principal.userId() && p.credentialVersion()==c.principal.credentialVersion()
                && auth.getAuthorities().stream().anyMatch(a->a.getAuthority().equals(c.operator?"ROLE_OPERATOR":"ROLE_CUSTOMER"));
        } catch(IllegalStateException invalidated) { return false; }
    }
    private void close(Connection c) { connections.remove(c.emitter); c.emitter.complete(); }
    private void accessEnded(Connection c) {
        try { c.emitter.send(SseEmitter.event().name("access-ended").data("refresh-session")); }
        catch(IOException | IllegalStateException ignored) { connections.remove(c.emitter); return; }
        close(c);
    }
    @PreDestroy void shutdown() { connections.values().forEach(this::close); workers.shutdownNow(); }
    static final class Connection {
        final SseEmitter emitter; final AccountPrincipal principal; final HttpSession session;
        final long id; final boolean operator; final AtomicBoolean running=new AtomicBoolean();
        Connection(SseEmitter emitter,AccountPrincipal principal,HttpSession session,long id,boolean operator) {
            this.emitter=emitter; this.principal=principal; this.session=session; this.id=id; this.operator=operator;
        }
    }
}
