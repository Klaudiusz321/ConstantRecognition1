import Image from "next/image";
import Link from "next/link";

const links = [
  { href: "/examples", label: "Examples" },
  { href: "/docs", label: "Method notes" },
  { href: "/compare", label: "Other methods" },
  { href: "/blog", label: "Notes" },
];

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-stone-50/95 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <Image
            src="/constant-recognizer-brand-pack/logo-mark.svg"
            alt="Constant Recognition logo"
            width={34}
            height={34}
            className="h-8 w-8 shrink-0"
            priority
          />
          <span className="truncate text-sm font-semibold uppercase tracking-[0.16em] text-slate-950">
            Constant Recognition
          </span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <Link
          href="/calculator"
          className="inline-flex h-10 items-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800"
        >
          Run calculator
        </Link>
      </nav>
    </header>
  );
}
