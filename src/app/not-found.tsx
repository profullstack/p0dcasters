import Link from "next/link";
import AdBanner from "@/components/AdBanner";

export default function NotFound() {
  return (
    <div className="wrap">
      <section className="empty">
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em" }}>Not found</h1>
        <p>That show is not in the directory.</p>
        <p style={{ marginTop: 22 }}>
          <Link className="btn" href="/">
            Back to the directory
          </Link>
        </p>
      </section>
      {/* Below the way out, so it is never the thing a reader who took a wrong
          turn is offered first. */}
      <AdBanner />
    </div>
  );
}
