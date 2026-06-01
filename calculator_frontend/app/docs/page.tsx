import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Documentation for Constant Recognition: workflow, precision model, K-complexity, CPU and WebGPU search, limitations, and citation guidance.",
  alternates: {
    canonical: "/docs",
  },
};

const steps = [
  {
    title: "Prepare the target value",
    body: "Use the decimal value exactly as reported by your computation. Keep only the digits whose precision you trust.",
  },
  {
    title: "Choose a search depth",
    body: "A larger maximum K allows deeper expressions but grows the search space quickly. Start small, inspect results, then expand.",
  },
  {
    title: "Select the domain and backend",
    body: "Use the real domain for ordinary constants. CPU/WASM is the stable default; WebGPU is experimental and hardware-dependent.",
  },
  {
    title: "Interpret candidates",
    body: "Compare relative error, K, and compression ratio. Treat a candidate as a mathematical lead until it has been independently verified.",
  },
];

const parameters = [
  ["Target value", "The decimal number to recognize."],
  ["Input precision", "The uncertainty attached to the target value."],
  ["K", "Expression code length or search depth used to bound formulas."],
  ["Relative error", "Numerical distance between candidate and target."],
  ["Compression ratio", "A ranking signal balancing error against expression length."],
  ["Domain", "Real or complex arithmetic used during candidate evaluation."],
];

export default function DocsPage() {
  return (
    <div className="bg-stone-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
            Documentation
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-normal text-slate-950 sm:text-5xl">
            Using Constant Recognition responsibly
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">
            This guide explains the calculator workflow, the meaning of the
            ranking columns, and the assumptions behind browser-based inverse
            symbolic search. It is written for researchers, students, and
            engineers who need reproducible numerical exploration rather than a
            single unexplained answer.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/calculator"
              className="inline-flex h-11 items-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800"
            >
              Open calculator
            </Link>
            <Link
              href="/examples"
              className="inline-flex h-11 items-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-950 transition-colors hover:border-slate-950"
            >
              View examples
            </Link>
          </div>
        </div>
      </section>

      <section id="workflow" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-3xl font-semibold tracking-normal">
              Search workflow
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              The calculator is a discovery tool. It searches candidate
              expressions and returns numerical matches, but the final
              mathematical claim should still be checked symbolically,
              analytically, or with independent high-precision computation.
            </p>
          </div>
          <ol className="grid gap-4">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="grid gap-2 rounded-lg border border-slate-200 bg-white p-5"
              >
                <div className="font-mono text-sm font-semibold text-teal-700">
                  Step {index + 1}
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

      <section id="accuracy" className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-semibold tracking-normal">
            Accuracy, K-complexity, and ranking
          </h2>
          <p className="mt-4 max-w-3xl leading-7 text-slate-600">
            A short expression with a slightly larger numerical error may be a
            stronger lead than a very long expression that overfits the input.
            Constant Recognition therefore exposes both numerical and
            structural information.
          </p>

          <div className="mt-8 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[680px] border-collapse bg-white text-left text-sm">
              <thead className="bg-stone-100 text-slate-700">
                <tr>
                  <th className="border-b border-slate-200 px-4 py-3 font-semibold">
                    Field
                  </th>
                  <th className="border-b border-slate-200 px-4 py-3 font-semibold">
                    Meaning
                  </th>
                </tr>
              </thead>
              <tbody>
                {parameters.map(([name, meaning]) => (
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

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-stone-50 p-5">
              <h3 className="font-semibold text-slate-950">
                Suggested starting point
              </h3>
              <p className="mt-3 leading-7 text-slate-600">
                Start with CPU/WASM, real domain, automatic precision, and a
                moderate K limit. Increase K only when the first results do not
                explain the value.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-stone-50 p-5">
              <h3 className="font-semibold text-slate-950">
                Verification discipline
              </h3>
              <p className="mt-3 leading-7 text-slate-600">
                Re-evaluate promising expressions at higher precision and check
                whether the expression is meaningful in the original scientific
                context.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="backends" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-normal">
              Compute backends
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              The application is intentionally browser-first. It avoids sending
              research values to a remote service and makes deployment possible
              as a static site.
            </p>
          </div>

          <div className="grid gap-4">
            <article className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-950">WebAssembly CPU</h3>
              <p className="mt-3 leading-7 text-slate-600">
                Stable default backend. It runs compiled search code in local
                browser workers and scales with the available CPU cores.
              </p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-950">
                WebGPU experimental
              </h3>
              <p className="mt-3 leading-7 text-slate-600">
                Uses compatible graphics hardware for broader parallelism. WebGPU
                support varies by browser, operating system, and driver.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="citation" className="border-t border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-semibold tracking-normal">
            Citation and attribution
          </h2>
          <p className="mt-4 max-w-3xl leading-7 text-slate-600">
            If the tool helps a publication, report the version or commit, the
            target value, the precision assumption, the selected backend, and the
            resulting candidate expression. A concise citation can use:
          </p>
          <pre className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-5 text-sm text-slate-100">
{`Constant Recognition, A. Odrzywolek and K. Sroka.
Browser-based inverse symbolic calculator.
https://github.com/Klaudiusz321/ConstantRecognition1`}
          </pre>
        </div>
      </section>
    </div>
  );
}
