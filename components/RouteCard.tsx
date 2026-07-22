import Link from "next/link";

export function RouteCard({ href, className, title, children }: { href: string; className: string; title: string; children: React.ReactNode }) {
  return (
    <Link className={`route-card ${className}`} href={href}>
      <h2>{title}</h2>
      <p>{children}</p>
    </Link>
  );
}
