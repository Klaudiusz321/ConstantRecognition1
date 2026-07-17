import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Method Notes",
  description:
    "Scientific documentation for Constant Recognition: inverse RPN search, code length K, numerical uncertainty, examples, limitations, and citation.",
  alternates: {
    canonical: "/docs",
  },
};

const workflow = [
  {
    title: "Choose a numerical target z",
    body: "Use a value produced by a calculation, measurement, integral, sum, simulation, or exercise. Do not supply more digits than are meaningful.",
  },
  {
    title: "Set the uncertainty",
    body: "When z is known only approximately, give an error estimate. Exact-looking decimal input can otherwise produce misleading overfitted formulas.",
  },
  {
    title: "Set maximum code length K",
    body: "K bounds the length of the RPN button sequence. Each additional step increases the search space roughly by the calculator alphabet size.",
  },
  {
    title: "Verify candidates outside the search",
    body: "A returned expression is a numerical lead. Recompute at higher precision or prove the identity from the original mathematical problem.",
  },
];

const notation = [
  ["z", "target numerical value"],
  ["Delta z", "absolute uncertainty of the input value"],
  ["delta z", "relative uncertainty Delta z / z"],
  ["K", "length of the RPN code being searched"],
  ["RPN", "reverse Polish notation button sequence"],
  ["CR", "compression-style ranking signal balancing error and length"],
];

const scientificExamples = [
  {
    topic: "High-precision numerical calculation",
    value: "0.51404189589007076139762973957688",
    candidate: "5*pi^2/96",
    comment:
      "A typical use case: a numerical integral or algebraic manipulation returns a decimal and the recognizer proposes a compact form.",
  },
  {
    topic: "Rational recognition",
    value: "0.22222222222",
    candidate: "2/9",
    comment:
      "Useful for teaching why decimal representations can hide very simple exact values.",
  },
  {
    topic: "Exercise generation",
    value: "0.846153846153846",
    candidate: "tanh(log(sqrt(12))) = 11/13",
    comment:
      "An example of an identity that is not obvious from the decimal representation and can become a problem for students.",
  },
  {
    topic: "Recreational integer identity",
    value: "2026",
    candidate: "1 + (9*5)^2",
    comment:
      "Integer and date-like inputs are not scientific evidence by themselves, but they are useful demonstrations of the search space.",
  },
];

export default function DocsPage() {
  return (
    <div className="bg-stone-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Method notes
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-normal text-slate-950 sm:text-5xl">
            Inverse search with a scientific RPN calculator
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">
            The calculator reverses the usual numerical workflow. Instead of
            entering a formula and obtaining a number, one enters a number and
            searches for short calculator programs that reproduce it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/calculator"
              className="inline-flex h-11 items-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-cyan-800"
            >
              Run calculator
            </Link>
            <a
              href="https://th.if.uj.edu.pl/~odrzywolek/WASM/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-950 transition-colors hover:border-slate-950"
            >
              Original description
            </a>
          </div>
        </div>
      </section>

      <section id="workflow" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-3xl font-semibold tracking-normal">
              Workflow
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Use the tool the way one uses a numerical experiment: record the
              input, the assumptions, the search parameters, and the candidate
              expression. The result is not a proof.
            </p>
          </div>
          <ol className="grid gap-4">
            {workflow.map((step, index) => (
              <li
                key={step.title}
                className="grid gap-2 rounded-lg border border-slate-200 bg-white p-5"
              >
                <div className="font-mono text-sm font-semibold text-cyan-700">
                  {index + 1}
                </div>
                <h3 className="text-lg font-semibold text-slate-950">
                  {step.title}
                </h3>
                <p className="leading-7 text-slate-600">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="rpn" className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1fr_1fr]">
          <div>
            <h2 className="text-3xl font-semibold tracking-normal">
              RPN model
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              The search space is defined by a standard scientific RPN
              calculator. Button sequences are encoded as integer codes, then
              evaluated one after another. The original browser version
              describes this as a virtual calculator whose buttons are pressed
              sequentially by CPUs rather than randomly by people.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-stone-50 p-5">
            <h3 className="font-semibold text-slate-950">
              Consequence for runtime
            </h3>
            <p className="mt-3 leading-7 text-slate-600">
              If the calculator alphabet has 36 buttons, increasing K by one
              multiplies the naive search space by about 36. Parallel CPU
              workers and WebGPU help, but the combinatorial growth remains the
              central limitation.
            </p>
          </div>
        </div>
      </section>

      <section id="accuracy" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-semibold tracking-normal">
            Notation and ranking
          </h2>
          <p className="mt-4 max-w-3xl leading-7 text-slate-600">
            Candidate formulas should be judged by both numerical accuracy and
            complexity. Long formulas can fit many decimal inputs by accident.
          </p>

          <div className="mt-8 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[680px] border-collapse bg-white text-left text-sm">
              <thead className="bg-stone-100 text-slate-700">
                <tr>
                  <th className="border-b border-slate-200 px-4 py-3 font-semibold">
                    Symbol
                  </th>
                  <th className="border-b border-slate-200 px-4 py-3 font-semibold">
                    Meaning
                  </th>
                </tr>
              </thead>
              <tbody>
                {notation.map(([name, meaning]) => (
                  <tr key={name} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-mono text-slate-950">
                      {name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="examples" className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-semibold tracking-normal">
            Scientific examples
          </h2>
          <p className="mt-4 max-w-3xl leading-7 text-slate-600">
            These examples are checks for numerical work and teaching: each one
            shows what was entered, what candidate was found, and what still
            has to be verified.
          </p>

          <div className="mt-8 grid gap-4">
            {scientificExamples.map((example) => (
              <article
                key={example.value}
                className="rounded-lg border border-slate-200 bg-stone-50 p-5"
              >
                <h3 className="font-semibold text-slate-950">
                  {example.topic}
                </h3>
                <div className="mt-3 grid gap-2 font-mono text-sm">
                  <code>z = {example.value}</code>
                  <code>candidate = {example.candidate}</code>
                </div>
                <p className="mt-3 leading-7 text-slate-600">
                  {example.comment}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="limitations" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-normal">
              Limitations
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Constant recognition is exploratory. A very close numerical match
              can still be meaningless if the expression is too long, if the
              input precision is overstated, or if the expression has no
              connection with the original problem.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="font-semibold text-slate-950">
              Minimum reporting checklist
            </h3>
            <ul className="mt-3 space-y-2 leading-7 text-slate-600">
              <li>Target value and number of significant digits.</li>
              <li>Assumed Delta z or statement that the search was exact.</li>
              <li>Maximum K and selected calculator/domain.</li>
              <li>Candidate expression and independent verification method.</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="citation" className="border-t border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-semibold tracking-normal">
            Citation and attribution
          </h2>
          <p className="mt-4 max-w-3xl leading-7 text-slate-600">
            If the tool contributes to a publication, cite the repository or
            deployed version and include the search parameters needed to
            reproduce the candidate.
          </p>
          <pre className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-5 text-sm text-slate-100">
{`Constant Recognition, A. Odrzywolek and K. Sroka.
Inverse RPN calculator for numerical constant recognition.
https://github.com/Klaudiusz321/ConstantRecognition1`}
          </pre>
        </div>
      </section>
    </div>
  );
}
