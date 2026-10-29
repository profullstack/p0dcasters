import Link from "next/link";
import { listHref, type ListSort } from "@/lib/sort";

/** Popular / Recent switch above a listing. Changing it goes back to page 1. */
export default function SortTabs({ path, sort }: { path: string; sort: ListSort }) {
  return (
    <nav className="sorttabs" aria-label="Sort shows">
      <Link
        className={`btn small${sort === "popular" ? " primary" : ""}`}
        href={listHref(path, "popular")}
        aria-current={sort === "popular" ? "page" : undefined}
      >
        Popular
      </Link>
      <Link
        className={`btn small${sort === "recent" ? " primary" : ""}`}
        href={listHref(path, "recent")}
        aria-current={sort === "recent" ? "page" : undefined}
        rel="nofollow"
      >
        Recent
      </Link>
    </nav>
  );
}
