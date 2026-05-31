import Link from 'next/link';

export const metadata = {
  title: "Documentation | Inverse Symbolic Calculator",
  description: "Learn how to use ConstantRecognition to find closed forms from numerical values, understand K-complexity, and utilize CPU/GPU search.",
};

export default function DocsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-20 text-slate-300 prose prose-invert prose-slate">
      <h1 className="text-4xl font-bold text-white mb-8">Documentation</h1>
      
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-white mb-4">How to find a closed form from a numerical value</h2>
        <p className="mb-4">
          To identify a numerical constant, navigate to the <Link href="/calculator" className="text-blue-400 hover:underline">calculator</Link>, enter your target decimal number (e.g., <code>3.14159</code>), select the operations you expect in the formula, and start the search. The algorithm will exhaustively generate mathematical expressions and compare their evaluated values against your target.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold text-white mb-4">What is K-Complexity?</h2>
        <p className="mb-4">
          In our <strong>inverse symbolic calculator</strong>, K-complexity (Kolmogorov-like complexity) represents the length or depth of the expression tree. A smaller K-complexity means a simpler formula (like <code>π + 1</code>). A higher K-complexity means deeper nesting and more operators (like <code>sqrt(exp(π) / 2) + 1</code>).
        </p>
        <p>
          The algorithm searches breadth-first through K-complexity levels, ensuring that the shortest and simplest closed-form representations are found first.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold text-white mb-4">CPU vs GPU Search</h2>
        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div className="bg-[#1a1a1c] p-6 rounded-xl border border-slate-800">
            <h3 className="font-bold text-white mb-2">WebAssembly (CPU)</h3>
            <p className="text-sm">Ideal for low-complexity searches and general use. It runs parallel across your CPU cores directly in the browser. It accurately handles complex arithmetic and high precision.</p>
          </div>
          <div className="bg-[#1a1a1c] p-6 rounded-xl border border-slate-800">
            <h3 className="font-bold text-white mb-2">WebGPU (Experimental)</h3>
            <p className="text-sm">Massive parallelization by offloading the brute-force generation to your graphics card. Suitable for very high K-complexity depths, functioning as a hyper-fast <strong>closed form finder</strong>.</p>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold text-white mb-4">Real vs Complex Numbers</h2>
        <p className="mb-4">
          The engine inherently supports complex number arithmetic during intermediate steps. Even if your target is a real number, the algorithm might traverse through complex space (using Euler's formula, for example) to arrive at the final real-valued formula.
        </p>
      </section>
    </div>
  );
}
