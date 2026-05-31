import Link from 'next/link';

export const metadata = {
  title: "Compare | Alternative to RIES, SymPy, Wolfram Alpha",
  description: "Compare ConstantRecognition with RIES calculator online, SymPy nsimplify, and Wolfram Alpha. See why it's the best PSLQ calculator alternative.",
};

export default function ComparePage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-20 text-slate-300">
      <h1 className="text-4xl font-bold text-white mb-6">Compare Inverse Symbolic Calculators</h1>
      <p className="text-lg mb-12 max-w-3xl">
        Looking for a <strong>RIES calculator online</strong> or a <strong>Wolfram Alpha constant recognition alternative</strong>? See how ConstantRecognition stacks up against traditional tools for finding formulas from decimal numbers.
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-800 mb-16">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#1a1a1c] border-b border-slate-800">
              <th className="p-4 text-white font-semibold">Feature</th>
              <th className="p-4 text-blue-400 font-semibold border-l border-slate-800">ConstantRecognition</th>
              <th className="p-4 text-white font-semibold border-l border-slate-800">RIES</th>
              <th className="p-4 text-white font-semibold border-l border-slate-800">Wolfram Alpha</th>
              <th className="p-4 text-white font-semibold border-l border-slate-800">SymPy / Maple</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            <tr>
              <td className="p-4 font-medium">Execution Environment</td>
              <td className="p-4 border-l border-slate-800 text-slate-200">Browser (WASM/WebGPU)</td>
              <td className="p-4 border-l border-slate-800">CLI / Server</td>
              <td className="p-4 border-l border-slate-800">Cloud Server</td>
              <td className="p-4 border-l border-slate-800">Python / Local Engine</td>
            </tr>
            <tr>
              <td className="p-4 font-medium">Privacy</td>
              <td className="p-4 border-l border-slate-800 text-slate-200">100% Local (No data sent)</td>
              <td className="p-4 border-l border-slate-800">Depends on host</td>
              <td className="p-4 border-l border-slate-800">Data sent to Wolfram</td>
              <td className="p-4 border-l border-slate-800">Local</td>
            </tr>
            <tr>
              <td className="p-4 font-medium">Method</td>
              <td className="p-4 border-l border-slate-800 text-slate-200">Exhaustive RPN Brute-force</td>
              <td className="p-4 border-l border-slate-800">Bidirectional Brute-force</td>
              <td className="p-4 border-l border-slate-800">Proprietary / Plouffe's Inverter</td>
              <td className="p-4 border-l border-slate-800">PSLQ / LLL Algorithms</td>
            </tr>
            <tr>
              <td className="p-4 font-medium">GPU Acceleration</td>
              <td className="p-4 border-l border-slate-800 text-green-400">Yes (WebGPU)</td>
              <td className="p-4 border-l border-slate-800 text-red-400">No</td>
              <td className="p-4 border-l border-slate-800 text-red-400">No</td>
              <td className="p-4 border-l border-slate-800 text-red-400">No</td>
            </tr>
            <tr>
              <td className="p-4 font-medium">Cost / Hosting</td>
              <td className="p-4 border-l border-slate-800 text-slate-200">Free / Zero server cost</td>
              <td className="p-4 border-l border-slate-800">Free CLI / Costly to host</td>
              <td className="p-4 border-l border-slate-800">Paid API / Freemium</td>
              <td className="p-4 border-l border-slate-800">Free / Paid (Maple)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-12">
        <div>
          <h2 className="text-2xl font-bold text-white mb-4">A Modern PSLQ Calculator Alternative</h2>
          <p className="mb-4">
            Algorithms like PSLQ (Integer Relation Detection) and LLL are standard in tools like SymPy (<code>nsimplify</code>) and Maple (<code>identify</code>). While mathematically elegant, they rely heavily on high-precision arithmetic and look up specific algebraic combinations.
          </p>
          <p>
            Our approach utilizes modern compute capabilities (WASM, GPU) to perform exhaustive search, discovering wild combinations of transcendental functions (sin, exp, gamma) that integer relation algorithms might miss.
          </p>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white mb-4">The Browser-First RIES</h2>
          <p className="mb-4">
            RIES (RILYBOT Inverse Equation Solver) is a fantastic tool, but it's primarily a C program run via command line. Hosting RIES as a web service requires backend compute resources.
          </p>
          <p>
            ConstantRecognition compiles the heavy lifting into WebAssembly, meaning your browser does the work. It is the perfect <strong>RIES calculator online</strong> alternative that scales infinitely with zero server costs.
          </p>
        </div>
      </div>
    </div>
  );
}
