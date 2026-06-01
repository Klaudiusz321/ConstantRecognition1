import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Method Comparison",
  description:
    "Compare Constant Recognition with PSLQ, RIES, SymPy nsimplify, Maple identify, and Wolfram Alpha for numerical constant recognition.",
  alternates: {
    canonical: "/compare",
  },
};

const rows = [
  ["Primary use", "Browser search", "Integer relations", "Inverse equation search", "General CAS"],
  ["Execution", "Local WASM/WebGPU", "Local library/tool", "Native CLI", "Cloud or local"],
  ["Best fit", "Exploration and sharing", "High-precision relation tests", "Broad expression search", "Symbolic workflows"],
  ["Privacy", "No upload by design", "Local", "Local unless hosted", "Depends on service"],
  ["Deployment", "Static web app", "Python/CAS environment", "Compiled native binary", "Service or installed CAS"],
];

const notes = [
  {
    title: "PSLQ and LLL remain essential",
    body: "Integer-relation algorithms are mathematically powerful when the basis is known and high precision is available. Constant Recognition is complementary: it explores expression candidates directly.",
  },
  {
    title: "RIES is the closest conceptual neighbor",
    body: "RIES is a mature inverse equation solver. This project focuses on a browser-native, static-deployable experience with local WASM workers and experimental GPU acceleration.",
  },
  {
    title: "CAS tools are broader",
    body: "Systems such as Mathematica, Maple, and SymPy cover much more than constant recognition. This project is narrower and designed for quick public use of one workflow.",
  },
];

export default function ComparePage() {
  return (
    <div className="bg-stone-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
            Comparison
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-normal sm:text-5xl">
            Where Constant Recognition fits among established tools
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">
            The project is not a replacement for every symbolic system. Its
            purpose is focused: a public, local, browser-based inverse symbolic
            calculator for numerical constants and candidate closed forms.
          </p>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead className="bg-slate-950 text-white">
              <tr>
                <th className="px-4 py-4 font-semibold">Dimension</th>
                <th className="px-4 py-4 font-semibold">Constant Recognition</th>
                <th className="px-4 py-4 font-semibold">PSLQ / LLL</th>
                <th className="px-4 py-4 font-semibold">RIES</th>
                <th className="px-4 py-4 font-semibold">CAS / Wolfram Alpha</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row[0]} className="border-b border-slate-100">
                  {row.map((cell, index) => (
                    <td
                      key={cell}
                      className={`px-4 py-4 ${index === 0 ? "font-semibold text-slate-950" : "text-slate-600"}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3">
          {notes.map((note) => (
            <article
              key={note.title}
              className="rounded-lg border border-slate-200 bg-stone-50 p-6"
            >
              <h2 className="text-lg font-semibold text-slate-950">
                {note.title}
              </h2>
              <p className="mt-3 leading-7 text-slate-600">{note.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">
              Use the calculator as a discovery layer.
            </h2>
            <p className="mt-2 max-w-2xl text-slate-600">
              Promising candidates should be verified with independent
              high-precision evaluation, symbolic manipulation, or a
              domain-specific derivation.
            </p>
          </div>
          <Link
            href="/docs#accuracy"
            className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-950 transition-colors hover:border-slate-950"
          >
            Read verification notes
          </Link>
        </div>
      </section>
    </div>
  );
}
