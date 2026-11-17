import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../auth/authState";

export default function ResponsiveNavigation({ children }: { children: ReactNode }) {
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const { account } = useAuth();
  const context = JSON.stringify([location.key, account?.id]);
  const open = openedFor === context;
  const setOpen = (value: boolean) => setOpenedFor(value ? context : null);

  useEffect(() => {
    const panel = dialog.current;
    const opener = trigger.current;
    if (!panel) return;
    if (open) {
      panel.showModal();
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previous;
        panel.close();
        if (opener?.getClientRects().length) opener.focus();
      };
    }
  }, [open]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const desktop = window.matchMedia("(min-width: 1001px)");
    const closeOnDesktop = () => { if (desktop.matches) setOpenedFor(null); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return <>
    <div className="discover-desktop-navigation">{children}</div>
    <button ref={trigger} className="discover-mobile-menu-button" type="button"
      aria-haspopup="dialog" aria-expanded={open} aria-controls="discover-mobile-menu"
      onClick={() => setOpen(true)}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
      Menu
    </button>
    <dialog ref={dialog} id="discover-mobile-menu" className="discover-mobile-drawer"
      aria-labelledby="discover-mobile-menu-title" onClose={() => setOpen(false)}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not(:disabled), [tabindex='0']"))
          .filter(element => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }}
      onClick={event => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false);
        }
      }}>
      {open && <>
        <div className="discover-mobile-drawer-heading">
          <h2 id="discover-mobile-menu-title">Your BiteMap menu</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close menu">×</button>
        </div>
        <div onClick={event => {
          if (event.target instanceof Element && event.target.closest("a, .discover-menu button")) setOpen(false);
        }}>{children}</div>
      </>}
    </dialog>
  </>;
}
