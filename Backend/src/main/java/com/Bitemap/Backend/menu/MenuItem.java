package com.Bitemap.Backend.menu;

import java.math.BigDecimal;
import jakarta.persistence.*;

@Entity
@Table(name = "vendor_menu_items")
public class MenuItem {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "vendor_id", nullable = false, updatable = false)
    private Long vendorId;
    @Column(nullable = false, length = 150)
    private String name;
    @Column(columnDefinition = "text")
    private String description;
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal price;
    @Enumerated(EnumType.STRING)
    @Column(name = "availability_status", nullable = false, length = 16)
    private MenuAvailability status;
    @Version
    private Long version;
    @Enumerated(EnumType.STRING)
    @Column(name = "image_preset", nullable = false, length = 24)
    private MenuImagePreset imagePreset = MenuImagePreset.GENERIC;
    @Column(name = "image_data", columnDefinition = "bytea")
    private byte[] imageData;
    @Column(name = "image_media_type", length = 32)
    private String imageMediaType;

    protected MenuItem() {}

    MenuItem(long vendorId, String name, String description, BigDecimal price, MenuAvailability status,
             MenuImagePreset imagePreset) {
        this.vendorId = vendorId;
        edit(name, description, price);
        changeAvailability(status);
        choosePreset(imagePreset);
    }

    MenuItem(long vendorId, String name, String description, BigDecimal price, MenuAvailability status) {
        this(vendorId, name, description, price, status, MenuImagePreset.GENERIC);
    }

    void edit(String name, String description, BigDecimal price) {
        this.name = name;
        this.description = description;
        this.price = price;
    }

    void changeAvailability(MenuAvailability status) { this.status = status; }
    void choosePreset(MenuImagePreset preset) {
        this.imagePreset = preset == null ? MenuImagePreset.GENERIC : preset;
        this.imageData = null;
        this.imageMediaType = null;
    }
    void uploadImage(byte[] data, String mediaType) {
        this.imageData = data;
        this.imageMediaType = mediaType;
    }
    public Long getId() { return id; }
    public Long getVendorId() { return vendorId; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public BigDecimal getPrice() { return price; }
    public MenuAvailability getStatus() { return status; }
    public Long getVersion() { return version; }
    public MenuImagePreset getImagePreset() { return imagePreset; }
    public byte[] getImageData() { return imageData; }
    public String getImageMediaType() { return imageMediaType; }
    public boolean hasCustomImage() { return imageData != null; }
}
