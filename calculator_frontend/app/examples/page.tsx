import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Worked Examples",
  description:
    "Scientific and teaching examples for recognizing constants from decimal values with Constant Recognition.",
  alternates: {
    canonical: "/examples",
  },
};

const examples = [
  {
    group: "Numerical calculation",
    input: "0.51404189589007076139762973957688",
    candidate: "5*pi^2/96",
    lesson:
      "A high-precision numerical result can suggest a compact analytic form.",
  },
  {
    group: "Floating-point output",
    input: "0.22222222222",
    candidate: "2/9",
    lesson:
      "Finite decimal output can hide a simple rational number.",
  },
  {
    group: "Elementary functions",
    input: "0.846153846153846",
    candidate: "tanh(log(sqrt(12))) = 11/13",
    lesson:
      "A recognizer can turn a non-obvious function identity into an exercise.",
  },
  {
    group: "Known constants",
    input: "1.202056903159594",
    candidate: "zeta(3)",
    lesson:
      "Named constants are useful tests, but availability depends on the calculator alphabet.",
  },
  {
    group: "Gaussian integral",
    input: "0.886226925452758",
    candidate: "sqrt(pi)/2",
    lesson:
      "A numerical integral can be checked against a familiar closed form.",
  },
  {
    group: "Integer identity",
    input: "2026",
    candidate: "1 + (9*5)^2",
    lesson:
      "Date-like and integer searches are demonstrations, not evidence of a scientific law.",
  },
];

export default function ExamplesPage() {
  return (
    <div className="bg-stone-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Worked examples
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-normal sm:text-5xl">
            Examples for numerical work and teaching
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">
            The point of an example is not that the program is impressive. The
            point is to see how much mathematical structure is already implied
            by a numerical value and a chosen expression alphabet.
          </p>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2">
          {examples.map((example) => (
            <article
              key={`${example.group}-${example.input}`}
              className="rounded-lg border border-slate-200 bg-white p-6"
            >
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {example.group}
              </div>
              <div className="grid gap-3 font-mono text-sm">
                <div className="rounded-md border border-slate-200 bg-stone-50 p-3 text-slate-700">
                  z = {example.input}
                </div>
                <div className="rounded-md border border-cyan-200 bg-cyan-50 p-3 text-cyan-900">
                  candidate = {example.candidate}
                </div>
              </div>
              <p className="mt-4 leading-7 text-slate-600">
                {example.lesson}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">
              How to use these examples
            </h2>
            <p className="mt-2 max-w-2xl leading-7 text-slate-600">
              Start with a small K. If the expected expression does not appear,
              check whether the calculator alphabet contains the required
              constants and functions, then increase K only as needed.
            </p>
          </div>
          <Link
            href="/calculator"
            className="inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-cyan-800"
          >
            Run calculator
          </Link>
        </div>
      </section>
    </div>
  );
}
