import Image from "next/image";
import Link from "next/link";

const metrics = [
  { label: "Execution", value: "local WASM" },
  { label: "Search model", value: "RPN expressions" },
  { label: "Acceleration", value: "CPU / WebGPU" },
  { label: "Data policy", value: "no server upload" },
];

const useCases = [
  {
    title: "Recognize constants in research output",
    text: "Turn numerical values from simulations, integrals, and symbolic experiments into candidate analytic expressions.",
  },
  {
    title: "Investigate unexplained constants",
    text: "Check whether a decimal resembles a known constant, a short expression, or a composition of elementary functions.",
  },
  {
    title: "Run reproducible local searches",
    text: "Keep computation in the browser so examples can be shared, inspected, and repeated without a hosted solver backend.",
  },
];

const workflow = [
  "Enter a decimal value with the precision you trust.",
  "Choose the search depth, domain, and allowed calculator mode.",
  "Run the WASM or WebGPU backend locally.",
  "Compare candidates by relative error and compression ratio.",
];

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Constant Recognition",
  applicationCategory: "ScientificApplication",
  operatingSystem: "Web",
  description:
    "Browser-based inverse symbolic calculator for recognizing numerical constants and finding candidate closed forms from decimal values.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
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

      <section className="relative isolate min-h-[76vh] overflow-hidden bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,.22) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.18) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="absolute inset-x-0 top-0 h-px bg-teal-300/60" />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-12">
          <div className="max-w-4xl pt-6">
            <div className="mb-8 flex flex-wrap items-center gap-4 text-sm text-slate-300">
              <Image
                src="/favicon-192.png"
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
              <span>Academic constant-recognition research project</span>
            </div>

            <h1 className="max-w-4xl text-5xl font-semibold tracking-normal text-white sm:text-6xl lg:text-7xl">
              Constant Recognition
            </h1>
            <p className="mt-6 max-w-3xl text-xl leading-8 text-slate-200">
              An inverse symbolic calculator for recovering compact candidate
              formulas from decimal values. It searches expression space in the
              browser, then ranks matches by numerical error and expression
              complexity.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href="/calculator"
                className="inline-flex h-12 items-center rounded-md bg-teal-500 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-teal-300"
              >
                Open calculator
              </Link>
              <Link
                href="/docs"
                className="inline-flex h-12 items-center rounded-md border border-slate-600 px-5 text-sm font-semibold text-white transition-colors hover:border-white"
              >
                Read documentation
              </Link>
            </div>
          </div>

          <div className="grid gap-4 border-y border-slate-800 py-6 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {metric.label}
                </div>
                <div className="mt-2 font-mono text-lg text-slate-100">
                  {metric.value}
                </div>
              </div>
            ))}
          </div>

          <div className="font-mono text-sm text-slate-300">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
              <code className="rounded-md border border-slate-800 bg-slate-900/80 p-4">
                input: 1.202056903159594
              </code>
              <span className="hidden text-slate-500 md:block">to</span>
              <code className="rounded-md border border-slate-800 bg-slate-900/80 p-4">
                search: K &lt;= 7, real domain
              </code>
              <span className="hidden text-slate-500 md:block">to</span>
              <code className="rounded-md border border-teal-500/50 bg-teal-950/40 p-4 text-teal-200">
                candidate: zeta(3)
              </code>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
              What it does
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              Find candidate closed forms for numbers that look accidental.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Constant Recognition is built for the moment when a computation
              produces a value such as 0.915965594177219 or 1.618033988749895
              and the next question is mathematical, not cosmetic: is there a
              simple expression behind it?
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {useCases.map((item) => (
              <article
                key={item.title}
                className="rounded-lg border border-slate-200 bg-white p-6"
              >
                <h3 className="text-lg font-semibold text-slate-950">
                  {item.title}
                </h3>
                <p className="mt-3 leading-7 text-slate-600">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              Method
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              A transparent search pipeline, not a black-box answer.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              The project explores exhaustive expression search over reverse
              Polish notation, with browser execution as the deployment model.
              Results are meant to be inspected: the shortest expression is not
              always the best explanation, so the interface exposes precision,
              relative error, and compression ratio.
            </p>
            <Link
              href="/compare"
              className="mt-8 inline-flex h-11 items-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-950 transition-colors hover:border-slate-950"
            >
              Compare with PSLQ and RIES
            </Link>
          </div>

          <ol className="grid gap-4">
            {workflow.map((step, index) => (
              <li
                key={step}
                className="grid grid-cols-[3rem_1fr] gap-4 rounded-lg border border-slate-200 bg-stone-50 p-5"
              >
                <span className="font-mono text-sm font-semibold text-teal-700">
                  0{index + 1}
                </span>
                <span className="text-slate-700">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-800">
              Separate application
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              The calculator now opens as a focused research tool.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              The promotional pages explain the project. The calculator route is
              isolated from the site navigation and footer, so the actual tool
              has the full viewport for input, settings, workers, and results.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="border-b border-slate-200 pb-4 font-mono text-sm text-slate-500">
              /calculator
            </div>
            <div className="grid gap-3 py-6 font-mono text-sm">
              <div className="rounded-md bg-slate-950 p-3 text-slate-100">
                z = 3.141592653589793
              </div>
              <div className="rounded-md bg-stone-100 p-3 text-slate-700">
                backend: WebAssembly CPU
              </div>
              <div className="rounded-md bg-teal-50 p-3 text-teal-800">
                ranked candidate: pi
              </div>
            </div>
            <Link
              href="/calculator"
              className="inline-flex h-11 items-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800"
            >
              Launch the app
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
