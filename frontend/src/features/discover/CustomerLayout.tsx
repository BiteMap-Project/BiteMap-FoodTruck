import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { BagIcon, ClockIcon, PinIcon, SearchIcon } from "../../components/icons";
import AccountNavigation from "./AccountNavigation";
import ResponsiveNavigation from "./ResponsiveNavigation";
import { useCartCount } from "../cart/useCartCount";
import "./discover.css";
import "./customer-layout.css";

export default function CustomerLayout() {
  const count = useCartCount();
  const location = useLocation();
  const discovery = ["/", "/trucks", "/stops"].includes(location.pathname);
  function destination(path: string) {
    const params = new URLSearchParams(discovery ? location.search : "");
    if ((path === "/trucks") !== (location.pathname === "/trucks")) params.delete("page");
    return { pathname: path, search: params.toString() };
  }
  return <div className="discovery customer-layout">
    <a className="discover-skip" href="#customer-content">Skip to content</a>
    <aside className="discover-sidebar" aria-label="BiteMap explorer">
      <Link className="discover-brand" to="/" aria-label="BiteMap home"><span className="discover-brand-mark"><PinIcon /></span><span>BiteMap<span className="discover-dot">.</span></span></Link>
      <Link className="customer-cart-shortcut" to="/cart" aria-label={`My cart, ${count} items`}><BagIcon /><span className="customer-cart-badge" aria-hidden="true">{count}</span></Link>
      <ResponsiveNavigation>
        <p className="discover-eyebrow sidebar-label">EXPLORE BITEMAP</p>
        <nav className="discover-menu" aria-label="Explore">
          <NavLink className="discover-menu-link" to={destination("/")} end><PinIcon />Truck map</NavLink>
          <NavLink className="discover-menu-link" to={destination("/trucks")}><SearchIcon />Discover trucks</NavLink>
          <NavLink className="discover-menu-link" to={destination("/stops")}><ClockIcon />Upcoming stops</NavLink>
        </nav>
        <AccountNavigation />
      </ResponsiveNavigation>
    </aside>
    <div id="customer-content" className="customer-content"><Outlet /></div>
  </div>;
}
