import Image from "next/image";
import Link from "next/link";

const facts = [
  { label: "Problem", value: "inverse calculation" },
  { label: "Expression model", value: "36-button RPN" },
  { label: "Search order", value: "increasing code length K" },
  { label: "Implementation", value: "C / WASM / WebGPU" },
];

const examples = [
  {
    input: "0.51404189589007076139762973957688",
    candidate: "5*pi^2/96",
    context: "recognition of a numerical result from a high-precision calculation",
  },
  {
    input: "-0.0833333333333",
    candidate: "-1/12",
    context: "simple rational value hidden by decimal notation",
  },
  {
    input: "11/13",
    candidate: "tanh(log(sqrt(12)))",
    context: "example of a non-obvious identity useful in teaching",
  },
];

const method = [
  "A virtual scientific RPN calculator defines the alphabet of operations.",
  "Integer codes enumerate button sequences in a fixed order.",
  "Each code is evaluated numerically and compared with the target value z.",
  "The search proceeds by increasing code length K, so short formulas appear first.",
];

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Constant Recognition",
  applicationCategory: "ScientificApplication",
  operatingSystem: "Web",
  description:
    "Browser implementation of an inverse RPN calculator for recognizing numerical constants and candidate closed-form expressions.",
  creator: [
    {
      "@type": "Person",
      name: "Andrzej Odrzywolek",
      affiliation: "Jagiellonian University",
    },
    {
      "@type": "Person",
      name: "Klaudiusz Sroka",
      affiliation: "Jagiellonian University",
    },
  ],
};

export default function LandingPage() {
  return (
    <div className="bg-stone-50 text-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <section className="relative isolate overflow-hidden bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,.22) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.18) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="absolute inset-x-0 top-0 h-px bg-cyan-300/70" />

        <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_0.72fr] lg:items-end">
          <div>
            <div className="mb-8 flex flex-wrap items-center gap-4 text-sm text-slate-300">
              <Image
                src="/constant-recognizer-brand-pack/logo-mark.svg"
                alt="Constant Recognition logo"
                width={56}
                height={56}
                priority
              />
              <span className="h-8 w-px bg-slate-700" aria-hidden="true" />
              <Image
                src="/cdaaebfdc71641160f831c2a2fb564ce8d081055.png"
                alt="Jagiellonian University crest"
                width={34}
                height={48}
              />
              <span>Inverse RPN calculator for numerical experiments</span>
            </div>

            <h1 className="max-w-4xl text-5xl font-semibold tracking-normal text-white sm:text-6xl lg:text-7xl">
              Constant Recognition
            </h1>
            <p className="mt-6 max-w-3xl text-xl leading-8 text-slate-200">
              A browser version of a constant-recognition experiment: enter a
              numerical result and search whether a short sequence of scientific
              calculator operations can reproduce it.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href="/calculator"
                className="inline-flex h-12 items-center rounded-md bg-cyan-300 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-200"
              >
                Run calculator
              </Link>
              <Link
                href="/docs"
                className="inline-flex h-12 items-center rounded-md border border-slate-600 px-5 text-sm font-semibold text-white transition-colors hover:border-white"
              >
                Read method notes
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-5 font-mono text-sm text-slate-200">
            <div className="text-slate-500">example session</div>
            <div className="mt-4 grid gap-3">
              <code>z = 0.51404189589007076139762973957688</code>
              <code>K max = 8</code>
              <code className="text-cyan-200">candidate = 5*pi^2/96</code>
              <code className="text-emerald-200">status = numerical lead</code>
            </div>
          </div>
        </div>

        <div className="relative mx-auto mt-12 grid max-w-7xl gap-4 border-y border-slate-800 py-6 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label}>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {fact.label}
              </div>
              <div className="mt-2 font-mono text-lg text-slate-100">
                {fact.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
              Problem
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              The usual calculator problem is reversed.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Normally one enters a formula and obtains a number. Here the input
              is a number, and the program enumerates formulas that could have
              produced it. This is useful when a computation returns a decimal
              value and the next question is whether it has a compact analytic
              form.
            </p>
          </div>

          <ol className="grid gap-4">
            {method.map((item, index) => (
              <li
                key={item}
                className="grid grid-cols-[3rem_1fr] gap-4 rounded-lg border border-slate-200 bg-white p-5"
              >
                <span className="font-mono text-sm font-semibold text-cyan-700">
                  {index + 1}
                </span>
                <span className="leading-7 text-slate-700">{item}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Examples
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              Numerical values should be treated as hypotheses, not answers.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              A match is a candidate identity. It becomes mathematics only after
              independent verification: higher precision, symbolic
              manipulation, or a derivation from the original problem.
            </p>
          </div>

          <div className="mt-10 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[780px] border-collapse bg-white text-left text-sm">
              <thead className="bg-stone-100 text-slate-700">
                <tr>
                  <th className="border-b border-slate-200 px-4 py-3 font-semibold">
                    Input value
                  </th>
                  <th className="border-b border-slate-200 px-4 py-3 font-semibold">
                    Candidate expression
                  </th>
                  <th className="border-b border-slate-200 px-4 py-3 font-semibold">
                    Use in practice
                  </th>
                </tr>
              </thead>
              <tbody>
                {examples.map((example) => (
                  <tr key={example.input} className="border-b border-slate-100">
                    <td className="px-4 py-4 font-mono text-slate-950">
                      {example.input}
                    </td>
                    <td className="px-4 py-4 font-mono text-cyan-800">
                      {example.candidate}
                    </td>
                    <td className="px-4 py-4 leading-7 text-slate-600">
                      {example.context}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8">
            <Link
              href="/examples"
              className="inline-flex h-11 items-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-950 transition-colors hover:border-slate-950"
            >
              More worked examples
            </Link>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_1fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              Cost of search
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              Increasing K is expensive.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              The original single-threaded browser version notes that each step
              in code length increases the search time by roughly a factor of
              36. The parallel and WebGPU versions are attempts to make larger
              searches more practical, not a reason to ignore the combinatorial
              growth.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-slate-950">
              What the web version is for
            </h3>
            <ul className="mt-4 space-y-3 leading-7 text-slate-600">
              <li>Checking numerical results from calculations or simulations.</li>
              <li>Preparing examples for teaching elementary functions.</li>
              <li>Comparing exact-looking formulas before doing a proof.</li>
              <li>Exploring the behavior of brute-force symbolic search.</li>
            </ul>
            <Link
              href="/calculator"
              className="mt-6 inline-flex h-11 items-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-cyan-800"
            >
              Run calculator
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
