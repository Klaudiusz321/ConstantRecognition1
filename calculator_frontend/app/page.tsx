'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

// Mathematical particle for floating animation
interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  symbol: string;
  speed: number;
  opacity: number;
  rotation: number;
  rotationSpeed: number;
}

interface FloatingEquation {
  id: number;
  x: number;
  y: number;
  equation: string;
  speed: number;
  opacity: number;
}

const mathSymbols = [
  'π', 'e', 'φ', '∞', '∫', '∑', '∏', '√', '∂', '∇',
  'Γ', 'ζ', 'sin', 'cos', 'tan', 'ln', 'log', 'exp',
  '+', '−', '×', '÷', '=', '^', '(', ')'
];

const equations = [
  'e^(iπ) + 1 = 0',
  'Γ(n) = (n-1)!',
  'φ = (1+√5)/2',
  'ζ(2) = π²/6',
  'e = lim(1+1/n)^n',
  '∫e^x dx = e^x'
];

export default function LandingPage() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [floatingEqs, setFloatingEqs] = useState<FloatingEquation[]>([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isLoaded, setIsLoaded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < 40; i++) {
      newParticles.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 24 + 14,
        symbol: mathSymbols[Math.floor(Math.random() * mathSymbols.length)],
        speed: Math.random() * 0.15 + 0.03,
        opacity: Math.random() * 0.12 + 0.03,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 0.5
      });
    }
    setParticles(newParticles);

    const newEqs: FloatingEquation[] = [];
    for (let i = 0; i < 6; i++) {
      newEqs.push({
        id: i,
        x: Math.random() * 80 + 10,
        y: Math.random() * 100,
        equation: equations[Math.floor(Math.random() * equations.length)],
        speed: Math.random() * 0.08 + 0.02,
        opacity: Math.random() * 0.08 + 0.02
      });
    }
    setFloatingEqs(newEqs);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setParticles(prev => prev.map(p => ({
        ...p,
        y: p.y - p.speed < -10 ? 110 : p.y - p.speed,
        x: p.x + Math.sin(p.y * 0.02) * 0.03,
        rotation: p.rotation + p.rotationSpeed
      })));
      setFloatingEqs(prev => prev.map(eq => ({
        ...eq,
        y: eq.y - eq.speed < -5 ? 105 : eq.y - eq.speed
      })));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({
      x: (e.clientX / window.innerWidth - 0.5) * 12,
      y: (e.clientY / window.innerHeight - 0.5) * 12
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const nodes: { x: number; y: number; vx: number; vy: number; baseX: number; baseY: number }[] = [];
    const gridSize = 100;
    for (let x = 0; x < canvas.width + gridSize; x += gridSize) {
      for (let y = 0; y < canvas.height + gridSize; y += gridSize) {
        nodes.push({
          x: x + (Math.random() - 0.5) * 20,
          y: y + (Math.random() - 0.5) * 20,
          baseX: x,
          baseY: y,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2
        });
      }
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      nodes.forEach((node, i) => {
        node.x += node.vx;
        node.y += node.vy;
        node.vx += (node.baseX - node.x) * 0.001;
        node.vy += (node.baseY - node.y) * 0.001;
        node.vx *= 0.99;
        node.vy *= 0.99;

        nodes.forEach((other, j) => {
          if (i >= j) return;
          const dx = other.x - node.x;
          const dy = other.y - node.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 120) {
            const opacity = (1 - dist / 120) * 0.04;
            ctx.strokeStyle = `rgba(100, 116, 139, ${opacity})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(other.x, other.y);
            ctx.stroke();
          }
        });

        ctx.fillStyle = 'rgba(100, 116, 139, 0.15)';
        ctx.beginPath();
        ctx.arc(node.x, node.y, 1, 0, Math.PI * 2);
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <div className="bg-[#0a0a0b] text-white overflow-x-hidden">
      {/* Hero Section */}
      <section 
        className="relative min-h-[90vh] flex items-center justify-center overflow-hidden"
        onMouseMove={handleMouseMove}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0b] via-[#0a0a0b]/80 to-[#0a0a0b] z-0"></div>
        <canvas ref={canvasRef} className="absolute inset-0 z-0 opacity-50" />
        
        <div className="absolute inset-0 z-1 pointer-events-none">
          {floatingEqs.map(eq => (
            <div key={eq.id} className="absolute font-mono text-slate-500 whitespace-nowrap" style={{ left: `${eq.x}%`, top: `${eq.y}%`, fontSize: '16px', opacity: eq.opacity + 0.08, transform: `translate(${mousePos.x * 0.02}px, ${mousePos.y * 0.02}px)` }}>{eq.equation}</div>
          ))}
        </div>

        <div className="absolute inset-0 z-2 pointer-events-none">
          {particles.map(particle => (
            <div key={particle.id} className="absolute font-mono text-slate-400" style={{ left: `${particle.x}%`, top: `${particle.y}%`, fontSize: `${particle.size}px`, opacity: particle.opacity + 0.05, transform: `rotate(${particle.rotation}deg) translate(${mousePos.x * 0.04}px, ${mousePos.y * 0.04}px)` }}>{particle.symbol}</div>
          ))}
        </div>

        <div className="relative z-10 text-center px-6" style={{ transform: `translate(${mousePos.x * 0.4}px, ${mousePos.y * 0.4}px)` }}>
          <h1 className={`text-5xl md:text-7xl lg:text-8xl font-black mb-6 transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="text-white">Constant</span><br />
            <span className="text-slate-400">Recognition</span>
          </h1>
          <div className={`mb-12 transition-all duration-1000 delay-200 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <h2 className="text-xl md:text-2xl text-slate-400 font-medium mb-4">The ultimate inverse symbolic calculator</h2>
            <p className="text-lg text-slate-500 max-w-lg mx-auto mb-2">
              <span className="text-slate-600 font-mono">3.14159265...</span> → <span className="text-white font-mono">π</span>
            </p>
            <p className="text-sm text-slate-600">Find the exact closed form formula from any decimal number</p>
          </div>
          <div className={`transition-all duration-1000 delay-400 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <Link href="/calculator">
              <button className="group relative px-10 py-4 text-lg font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 transition-all duration-300 shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] hover:-translate-y-1">
                <span className="flex items-center gap-3 text-white">
                  Launch Calculator
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Main Content Sections */}
      <section className="py-24 px-6 bg-[#0f0f11]">
        <div className="max-w-4xl mx-auto space-y-24">
          
          {/* What it does */}
          <div className="text-center">
            <h2 className="text-3xl font-bold mb-6 text-white">Find Formula From Decimal Number</h2>
            <p className="text-slate-400 text-lg leading-relaxed mb-6">
              Have you ever encountered a mysterious floating-point value like <code className="text-slate-300 bg-slate-800 px-2 py-1 rounded">1.61803398</code> or <code className="text-slate-300 bg-slate-800 px-2 py-1 rounded">2.50290787</code> and wondered where it came from? ConstantRecognition is a powerful <strong>inverse symbolic calculator</strong> and <strong>closed form finder</strong> that identifies the exact mathematical expression generating your numerical constant.
            </p>
            <p className="text-slate-400 text-lg leading-relaxed">
              We perform an exhaustive brute-force search over a massive space of equations to instantly recognize mathematical constants, acting as a highly efficient alternative to traditional tools like PSLQ, RIES calculator online, and Wolfram Alpha.
            </p>
          </div>

          {/* For Whom */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6 text-white">Who is this for?</h2>
              <ul className="space-y-4">
                <li className="flex gap-4">
                  <div className="mt-1 w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                    <span className="text-blue-400">🔬</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-200">Physicists & Researchers</h3>
                    <p className="text-slate-500 text-sm">Discover the analytic form behind experimental data or complex simulation outputs.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <div className="mt-1 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                    <span className="text-purple-400">📐</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-200">Mathematicians</h3>
                    <p className="text-slate-500 text-sm">Quickly identify numerical constants generated by integrals, infinite sums, or continued fractions.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <div className="mt-1 w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                    <span className="text-green-400">💻</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-200">Engineers & Programmers</h3>
                    <p className="text-slate-500 text-sm">Reverse-engineer magic numbers found in source code into their exact representations.</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="bg-[#1a1a1c] border border-slate-800 p-8 rounded-2xl shadow-xl">
              <h3 className="text-xl font-bold text-white mb-4">Example Identification</h3>
              <div className="space-y-4 font-mono text-sm">
                <div className="bg-black/50 p-4 rounded text-slate-400">
                  Input: 1.202056903159594<br/>
                  <span className="text-green-400">Match found!</span>
                </div>
                <div className="flex justify-center py-2 text-2xl text-white">
                  ζ(3)
                </div>
                <div className="text-slate-500 text-center text-xs">Apéry's constant</div>
              </div>
            </div>
          </div>

          {/* Features */}
          <div>
            <h2 className="text-3xl font-bold mb-10 text-center text-white">Why use ConstantRecognition?</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-[#1a1a1c] p-6 rounded-xl border border-slate-800 hover:border-slate-600 transition-colors">
                <h3 className="text-lg font-semibold text-slate-200 mb-2">WebAssembly Fast</h3>
                <p className="text-slate-500 text-sm">Runs exhaustive brute-force search directly in your browser using high-performance WASM.</p>
              </div>
              <div className="bg-[#1a1a1c] p-6 rounded-xl border border-slate-800 hover:border-slate-600 transition-colors">
                <h3 className="text-lg font-semibold text-slate-200 mb-2">GPU Acceleration</h3>
                <p className="text-slate-500 text-sm">Offload computations to your graphics card (WebGPU) for massive parallel equation testing.</p>
              </div>
              <div className="bg-[#1a1a1c] p-6 rounded-xl border border-slate-800 hover:border-slate-600 transition-colors">
                <h3 className="text-lg font-semibold text-slate-200 mb-2">100% Free & Local</h3>
                <p className="text-slate-500 text-sm">No backend hosting costs. The entire algorithm executes on your machine, ensuring complete privacy.</p>
              </div>
              <div className="bg-[#1a1a1c] p-6 rounded-xl border border-slate-800 hover:border-slate-600 transition-colors">
                <h3 className="text-lg font-semibold text-slate-200 mb-2">Open Source Alternative</h3>
                <p className="text-slate-500 text-sm">A modern, open-source alternative to SymPy nsimplify, Maple identify, and Wolfram Alpha.</p>
              </div>
            </div>
          </div>

          {/* Call to action bottom */}
          <div className="text-center pb-12">
            <h2 className="text-2xl font-bold mb-6 text-white">Ready to identify a numerical value?</h2>
            <Link href="/calculator">
              <button className="px-8 py-3 text-lg font-semibold rounded-lg bg-white text-black hover:bg-slate-200 transition-colors shadow-lg">
                Start Calculator
              </button>
            </Link>
          </div>

        </div>
      </section>
    </div>
  );
}
