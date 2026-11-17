package com.Bitemap.Backend.location.management;

import java.net.URI;
import java.util.List;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;

@RestController @RequestMapping("/api/operator/saved-locations")
@Tag(name="Saved pickup locations",description="Private operator address book, reusable across owned trucks. Copies do not update published stops. Maximum 100 active locations.")
public class SavedLocationController {
    private final SavedLocationService service;
    public SavedLocationController(SavedLocationService service) { this.service=service; }
    @GetMapping public ResponseEntity<List<SavedLocation>> list(Authentication auth) { return ok(service.list(auth.getName())); }
    @GetMapping("/{id}") public ResponseEntity<SavedLocation> get(Authentication auth,@PathVariable long id) { return ok(service.get(auth.getName(),id)); }
    @PostMapping @SecurityRequirement(name="csrfToken")
    public ResponseEntity<SavedLocation> create(Authentication auth,@Valid @RequestBody SavedLocation.Details request) {
        var result=service.create(auth.getName(),request);
        return ResponseEntity.created(URI.create("/api/operator/saved-locations/"+result.id())).cacheControl(CacheControl.noStore()).body(result);
    }
    @PutMapping("/{id}") @SecurityRequirement(name="csrfToken")
    public ResponseEntity<SavedLocation> update(Authentication auth,@PathVariable long id,@Valid @RequestBody SavedLocation.Update request) { return ok(service.update(auth.getName(),id,request)); }
    @PostMapping("/{id}/archive") @SecurityRequirement(name="csrfToken")
    public ResponseEntity<SavedLocation> archive(Authentication auth,@PathVariable long id,@Valid @RequestBody SavedLocation.Archive request) { return ok(service.archive(auth.getName(),id,request)); }
    private static <T> ResponseEntity<T> ok(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
}
