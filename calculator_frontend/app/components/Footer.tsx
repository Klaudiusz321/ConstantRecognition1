import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-[#0a0a0b] border-t border-slate-800 py-12 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
        <div>
          <h3 className="text-white font-bold mb-4">ConstantRecognition</h3>
          <p className="text-slate-500 text-sm">
            An open-source, web-based inverse symbolic calculator and closed form finder using WASM and GPU acceleration.
          </p>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-4">Features</h4>
          <ul className="text-slate-500 text-sm space-y-2">
            <li><Link href="/calculator" className="hover:text-white transition-colors">Launch App</Link></li>
            <li><Link href="/examples" className="hover:text-white transition-colors">Find formula from decimal</Link></li>
            <li><Link href="/docs" className="hover:text-white transition-colors">Documentation</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-4">Resources</h4>
          <ul className="text-slate-500 text-sm space-y-2">
            <li><Link href="/compare" className="hover:text-white transition-colors">RIES / PSLQ alternative</Link></li>
            <li><Link href="/blog" className="hover:text-white transition-colors">Blog</Link></li>
            <li>
              <a 
                href="https://github.com/Klaudiusz321/ConstantRecognition" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                GitHub Repository
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-4">About</h4>
          <p className="text-slate-500 text-sm">
            Created by Andrzej Odrzywołek &amp; Klaudiusz Sroka, UJ {new Date().getFullYear()}.
          </p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto text-center text-slate-600 text-xs border-t border-slate-800/50 pt-8 mt-8">
        <p>A fast online alternative to Wolfram Alpha constant recognition, SymPy nsimplify, and Maple identify.</p>
      </div>
    </footer>
  );
}
