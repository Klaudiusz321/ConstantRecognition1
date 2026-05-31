import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0b]/80 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-slate-400 font-mono">π</span>
            ConstantRecognition
          </Link>
          <div className="hidden md:flex items-center gap-4 text-sm font-medium text-slate-400">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <Link href="/examples" className="hover:text-white transition-colors">Examples</Link>
            <Link href="/compare" className="hover:text-white transition-colors">Compare</Link>
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/calculator">
            <button className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#1a1a1c] border border-slate-700 hover:border-slate-500 hover:bg-[#2a2a2e] transition-all text-white">
              Launch Calculator
            </button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
