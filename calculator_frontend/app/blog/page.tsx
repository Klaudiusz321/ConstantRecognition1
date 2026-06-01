import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Notes",
  description:
    "Short notes on inverse RPN search, numerical examples, and verification for Constant Recognition.",
  alternates: {
    canonical: "/blog",
  },
};

const notes = [
  {
    label: "Method",
    title: "Inverse use of a scientific calculator",
    body: "The ordinary workflow formula -> number is reversed. The program searches for button sequences whose numerical result matches the input.",
    href: "/docs#rpn",
  },
  {
    label: "Search cost",
    title: "Why K cannot be increased casually",
    body: "A 36-button alphabet means that adding one symbol to the code length multiplies the naive search space by about 36.",
    href: "/docs#rpn",
  },
  {
    label: "Verification",
    title: "A candidate is not a proof",
    body: "Numerical recognition should be followed by high-precision recomputation, symbolic manipulation, or a derivation from the original problem.",
    href: "/docs#limitations",
  },
];

export default function BlogPage() {
  return (
    <div className="bg-stone-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Notes
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-normal sm:text-5xl">
            Short notes on the method
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">
            This page is intentionally modest. It collects compact explanations
            that link back to maintained documentation instead of pretending to
            be a blog with finished articles.
          </p>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-5">
          {notes.map((note) => (
            <article
              key={note.title}
              className="rounded-lg border border-slate-200 bg-white p-6"
            >
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {note.label}
              </div>
              <h2 className="text-2xl font-semibold text-slate-950">
                {note.title}
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-slate-600">
                {note.body}
              </p>
              <Link
                href={note.href}
                className="mt-5 inline-flex h-10 items-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-950 transition-colors hover:border-slate-950"
              >
                Read the relevant section
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
