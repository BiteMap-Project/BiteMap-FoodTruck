import { useState } from "react";

/** Decorative photo: the adjacent menu-item heading already supplies its name. */
export default function MenuPhoto({ src, fallback }: { src?: string; fallback: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <span aria-hidden="true" data-testid="menu-photo-fallback">{fallback}</span>;
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />;
}
