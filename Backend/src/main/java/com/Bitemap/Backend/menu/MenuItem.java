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

    protected MenuItem() {}

    MenuItem(long vendorId, String name, String description, BigDecimal price, MenuAvailability status) {
        this.vendorId = vendorId;
        edit(name, description, price);
        changeAvailability(status);
    }

    void edit(String name, String description, BigDecimal price) {
        this.name = name;
        this.description = description;
        this.price = price;
    }

    void changeAvailability(MenuAvailability status) { this.status = status; }
    public Long getId() { return id; }
    public Long getVendorId() { return vendorId; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public BigDecimal getPrice() { return price; }
    public MenuAvailability getStatus() { return status; }
    public Long getVersion() { return version; }
}
