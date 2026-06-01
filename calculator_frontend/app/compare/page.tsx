import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Relation to Other Methods",
  description:
    "Academic comparison of Constant Recognition with PSLQ, RIES, CAS tools, and numerical verification workflows.",
  alternates: {
    canonical: "/compare",
  },
};

const rows = [
  ["Question", "Can a short calculator program reproduce z?", "Is z in an integer relation over a chosen basis?", "Can an inverse equation solver find a compact expression?", "Can a general symbolic system simplify or prove it?"],
  ["Input requirement", "Decimal value and uncertainty", "High-precision value and basis", "Decimal value and operator set", "Symbolic expression or high-level query"],
  ["Strength", "Transparent enumeration of a defined search space", "Strong theory for integer relations", "Mature inverse-search approach", "Broad symbolic and numerical functionality"],
  ["Weakness", "Combinatorial growth with K", "Requires the right basis", "Usually a native/CLI workflow", "May hide method details or require manual setup"],
  ["Best role", "Exploration and teaching", "Verification after a plausible basis is known", "Independent comparison", "Proof, simplification, and high-precision checks"],
];

const notes = [
  {
    title: "This is not a replacement for proof",
    body: "The recognizer proposes candidates. A mathematical identity still needs independent verification.",
  },
  {
    title: "The search space is explicit",
    body: "Changing the calculator alphabet changes what can be found. A missing operation means a true formula may be unreachable.",
  },
  {
    title: "Precision matters",
    body: "If the input has only a few reliable digits, many unrelated short formulas may look plausible.",
  },
];

export default function ComparePage() {
  return (
    <div className="bg-stone-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Relation to other methods
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-normal sm:text-5xl">
            Constant recognition is a numerical experiment
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">
            The tool belongs next to PSLQ, RIES, computer algebra systems, and
            high-precision verification. It is useful because the searched
            expression space is concrete and inspectable.
          </p>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-slate-950 text-white">
              <tr>
                <th className="px-4 py-4 font-semibold">Aspect</th>
                <th className="px-4 py-4 font-semibold">Constant Recognition</th>
                <th className="px-4 py-4 font-semibold">PSLQ / LLL</th>
                <th className="px-4 py-4 font-semibold">RIES-like search</th>
                <th className="px-4 py-4 font-semibold">CAS tools</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row[0]} className="border-b border-slate-100">
                  {row.map((cell, index) => (
                    <td
                      key={cell}
                      className={`px-4 py-4 align-top leading-6 ${index === 0 ? "font-semibold text-slate-950" : "text-slate-600"}`}
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
    </div>
  );
}
