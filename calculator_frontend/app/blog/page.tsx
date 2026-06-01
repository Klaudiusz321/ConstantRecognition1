import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Research Notes",
  description:
    "Short research notes on inverse symbolic computation, numerical constant recognition, browser execution, and verification.",
  alternates: {
    canonical: "/blog",
  },
};

const notes = [
  {
    label: "Guide",
    title: "How to investigate an unexplained decimal value",
    body: "Begin with precision discipline, restrict the search space, and treat every expression as a candidate until independently verified.",
    href: "/docs#workflow",
  },
  {
    label: "Method",
    title: "Why expression length matters as much as numerical error",
    body: "Constant recognition is vulnerable to overfitting. Ranking should balance closeness to the target with the complexity of the expression.",
    href: "/docs#accuracy",
  },
  {
    label: "Engineering",
    title: "Why the calculator runs in the browser",
    body: "A static browser app avoids server queues, keeps values local, and makes the same tool easy to use in lectures, labs, and papers.",
    href: "/compare",
  },
];

export default function BlogPage() {
  return (
    <div className="bg-stone-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
            Research notes
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-normal sm:text-5xl">
            Notes for users who want to understand the method
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">
            This section keeps the public site useful without fake article
            links. Each note points to maintained documentation or comparison
            pages until dedicated long-form articles are ready.
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
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
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
                Read related documentation
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
