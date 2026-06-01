import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Worked Examples",
  description:
    "Worked examples for recognizing constants from decimal values with Constant Recognition.",
  alternates: {
    canonical: "/examples",
  },
};

const examples = [
  {
    name: "Pi",
    value: "3.141592653589793",
    formula: "pi",
    note: "A baseline check for recognizing a fundamental constant directly.",
  },
  {
    name: "Euler number",
    value: "2.718281828459045",
    formula: "e",
    note: "Useful for confirming that the selected calculator mode includes exponential constants.",
  },
  {
    name: "Golden ratio",
    value: "1.618033988749895",
    formula: "(1 + sqrt(5)) / 2",
    note: "A compact algebraic expression that should rank strongly at low K.",
  },
  {
    name: "Apery's constant",
    value: "1.202056903159594",
    formula: "zeta(3)",
    note: "A good example of a named constant whose recognition depends on the enabled operations.",
  },
  {
    name: "Gaussian integral half-value",
    value: "0.886226925452758",
    formula: "sqrt(pi) / 2",
    note: "Shows how a value produced by an integral can reduce to a simple expression.",
  },
  {
    name: "Catalan constant",
    value: "0.915965594177219",
    formula: "G",
    note: "A useful test for distinguishing named constants from nearby numerical coincidences.",
  },
];

export default function ExamplesPage() {
  return (
    <div className="bg-stone-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
            Examples
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-normal sm:text-5xl">
            Start with known constants, then test your own data.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">
            These values are intentionally familiar. They help calibrate search
            depth, precision assumptions, and enabled operations before running
            the calculator on research data or unexplained simulation output.
          </p>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2">
          {examples.map((example) => (
            <article
              key={example.name}
              className="rounded-lg border border-slate-200 bg-white p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">
                    {example.name}
                  </h2>
                  <p className="mt-2 leading-7 text-slate-600">
                    {example.note}
                  </p>
                </div>
                <span className="rounded-md bg-teal-50 px-3 py-1 font-mono text-sm text-teal-800">
                  {example.formula}
                </span>
              </div>

              <div className="mt-6 grid gap-3 font-mono text-sm">
                <div className="rounded-md border border-slate-200 bg-stone-50 p-3 text-slate-700">
                  target = {example.value}
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3 text-slate-700">
                  candidate = {example.formula}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">
              Ready to run a value from your own work?
            </h2>
            <p className="mt-2 max-w-2xl text-slate-600">
              Enter the decimal value in the calculator and start with a
              conservative K limit. Increase the search only after inspecting
              the early candidates.
            </p>
          </div>
          <Link
            href="/calculator"
            className="inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800"
          >
            Open calculator
          </Link>
        </div>
      </section>
    </div>
  );
}
