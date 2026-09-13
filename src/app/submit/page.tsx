import type { Metadata } from "next";
import SubmitForm from "@/components/SubmitForm";
import AdBanner from "@/components/AdBanner";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Add a show",
  description:
    "Add a self-hosted podcast to p0dcasters: paste the site or feed URL and it is checked and listed on the spot.",
  alternates: { canonical: "/submit" },
};

/**
 * The share target too: the manifest sends a shared link here as ?url=, so
 * "share to p0dcasters" from a podcast's site on a phone lands with the box
 * filled in.
 */
export default async function Submit({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  // A shared page arrives as url= or, from apps that only fill text=, inside
  // the text; take whichever carries a link.
  const shared = str(p.url) || (str(p.text).match(/https?:\/\/\S+/)?.[0] ?? "");
  return (
    <div className="wrap narrow">
      <SubmitForm initial={shared} error={str(p.error)} errorUrl={str(p.url) && str(p.error) ? str(p.url) : ""} />
      <AdBanner />
    </div>
  );
}
