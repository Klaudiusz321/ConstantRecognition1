import Link from 'next/link';

export const metadata = {
  title: "Examples | Recognize Mathematical Constants",
  description: "See how to find formula from decimal numbers with examples of known constants recognized by our inverse symbolic calculator.",
};

export default function ExamplesPage() {
  const examples = [
    { name: "Pi (π)", value: "3.14159265359", formula: "π", description: "The ratio of a circle's circumference to its diameter." },
    { name: "Euler's Number (e)", value: "2.71828182846", formula: "e", description: "The base of the natural logarithm." },
    { name: "Golden Ratio (φ)", value: "1.61803398875", formula: "(1+√5)/2", description: "A famous irrational number found in nature and art." },
    { name: "Catalan's Constant", value: "0.91596559417", formula: "G", description: "Occurs in estimates of combinatorial objects and integrals." },
    { name: "Apéry's Constant", value: "1.20205690315", formula: "ζ(3)", description: "The sum of the reciprocals of the positive cubes." },
    { name: "Gaussian Integral", value: "0.88622692545", formula: "√π/2", description: "The integral of e^(-x^2) from 0 to infinity." },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-20 text-slate-300">
      <h1 className="text-4xl font-bold text-white mb-6">Find Formula From Decimal Number - Examples</h1>
      <p className="text-lg mb-12">
        See how our <strong>closed form finder</strong> can easily identify numerical constants. Try copying any of these floating-point values into the calculator to verify the results.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {examples.map((ex, i) => (
          <div key={i} className="bg-[#1a1a1c] border border-slate-800 p-6 rounded-xl hover:border-slate-600 transition-colors">
            <h2 className="text-xl font-bold text-white mb-2">{ex.name}</h2>
            <p className="text-slate-400 text-sm mb-4">{ex.description}</p>
            <div className="bg-black/50 p-3 rounded font-mono text-sm mb-4 overflow-x-auto text-slate-300">
              {ex.value}
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-blue-400 font-bold">{ex.formula}</span>
              <Link href="/calculator">
                <button className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded text-white transition-colors">
                  Try it
                </button>
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-16 bg-blue-900/20 border border-blue-800 p-8 rounded-xl text-center">
        <h2 className="text-2xl font-bold text-white mb-4">Have your own numerical value?</h2>
        <p className="mb-6">Use our PSLQ calculator alternative to recognize the mathematical constant.</p>
        <Link href="/calculator">
          <button className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-semibold transition-colors">
            Launch Inverse Symbolic Calculator
          </button>
        </Link>
      </div>
    </div>
  );
}
