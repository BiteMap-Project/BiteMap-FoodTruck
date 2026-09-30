import { Link } from "react-router-dom";

function NotFoundPage() {
  return (
    <main className="truck-profile not-found">
      <h1>Page not found</h1>
      <p>We couldn't find that page. It may have moved, or the link may be wrong.</p>
      <Link to="/">← Back to trucks</Link>
    </main>
  );
}

export default NotFoundPage;
