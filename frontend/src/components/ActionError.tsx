import { useEffect, useRef } from "react";
import "./action-error.css";

/** Use for an action/form failure, not for background polling errors. */
export default function ActionError({ message, className = "", id }: {
  message: string;
  className?: string;
  id?: string;
}) {
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message) alert.current?.focus();
  }, [message]);

  return message ? <p id={id} ref={alert} tabIndex={-1} role="alert"
    className={`action-error ${className}`}>{message}</p> : null;
}
