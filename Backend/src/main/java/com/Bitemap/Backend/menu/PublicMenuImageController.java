package com.Bitemap.Backend.menu;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/vendors/{vendorId}/menu-items")
public class PublicMenuImageController {
    private final MenuItemRepository items;

    public PublicMenuImageController(MenuItemRepository items) { this.items = items; }

    @GetMapping("/{itemId}/image")
    public ResponseEntity<byte[]> image(@PathVariable long vendorId, @PathVariable long itemId) {
        var item = items.findByIdAndVendorId(itemId, vendorId).orElseThrow(MenuNotFoundException::new);
        if (!item.hasCustomImage()) throw new MenuNotFoundException();
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noCache().cachePublic())
                .eTag(org.springframework.util.DigestUtils.md5DigestAsHex(item.getImageData()))
                .header("Content-Type", item.getImageMediaType())
                .body(item.getImageData());
    }
}
