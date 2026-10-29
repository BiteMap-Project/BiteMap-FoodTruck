/** Shared shapes returned by BiteMap's backend APIs. */
export type Page<T> = {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type Vendor = {
  id: number;
  name: string;
  category: string;
  location: string;
};

export type PublicMenuItem = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
  imagePreset?: MenuImagePreset;
  hasCustomImage?: boolean;
};

export type VendorProfile = Vendor & { menu: PublicMenuItem[] };

export type AccountRole = "ROLE_CUSTOMER" | "ROLE_OPERATOR" | "ROLE_ADMIN";

export type Account = {
  id: number;
  displayName: string;
  email: string;
  roles: string[];
};

export type Availability = "ACTIVE" | "INACTIVE" | "SOLD_OUT";
export type MenuImagePreset = "GENERIC" | "DRINK" | "TACO" | "INDIAN" | "DESSERT";

export type ManagedMenuItem = {
  id: number;
  vendorId: number;
  name: string;
  description: string | null;
  price: number;
  status: Availability;
  version: number;
  imagePreset?: MenuImagePreset;
  hasCustomImage?: boolean;
};

export type OrderStatus = "PLACED" | "ACCEPTED" | "READY" | "COMPLETED" | "CANCELLED";

export type OrderItem = {
  menuItemId: number;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type PickupDetails = {
  stopId: number;
  venueName: string;
  address: string;
  latitude: number;
  longitude: number;
  startsAt: string;
  endsAt: string;
  timeZone: string;
};

export type CustomerOrderSummary = {
  id: number;
  vendorId: number;
  vendorName: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  estimatedReadyAt?: string | null;
};

export type CustomerOrder = CustomerOrderSummary & {
  cancellationReason?: string | null;
  pickup?: PickupDetails | null;
  items: OrderItem[];
};

export type OwnerOrderSummary = {
  id: number;
  vendorId: number;
  status: OrderStatus;
  total: number;
  createdAt: string;
  updatedAt: string;
  estimatedReadyAt?: string | null;
  version: number;
  cancellationReason: string | null;
};

export type OwnerOrder = OwnerOrderSummary & {
  pickup?: PickupDetails | null;
  items: OrderItem[];
};
