import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="mb-4 flex items-center gap-3">
            <Image
              src="/constant-recognizer-brand-pack/logo-mark.svg"
              alt="Constant Recognition logo"
              width={36}
              height={36}
            />
            <h3 className="text-base font-semibold text-slate-950">
              Constant Recognition
            </h3>
          </div>
          <p className="max-w-sm text-sm leading-6 text-slate-600">
            An academic inverse symbolic calculator for recovering candidate
            closed forms from numerical values. The calculator runs locally in
            the browser with WebAssembly and experimental WebGPU support.
          </p>
        </div>

        <div>
          <h4 className="mb-4 text-sm font-semibold text-slate-950">Project</h4>
          <ul className="space-y-3 text-sm text-slate-600">
            <li>
              <Link className="hover:text-slate-950" href="/calculator">
                Calculator app
              </Link>
            </li>
            <li>
              <Link className="hover:text-slate-950" href="/examples">
                Worked examples
              </Link>
            </li>
            <li>
              <Link className="hover:text-slate-950" href="/compare">
                Method comparison
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="mb-4 text-sm font-semibold text-slate-950">
            Documentation
          </h4>
          <ul className="space-y-3 text-sm text-slate-600">
            <li>
              <Link className="hover:text-slate-950" href="/docs#workflow">
                Search workflow
              </Link>
            </li>
            <li>
              <Link className="hover:text-slate-950" href="/docs#accuracy">
                Accuracy model
              </Link>
            </li>
            <li>
              <Link className="hover:text-slate-950" href="/docs#citation">
                Citation
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="mb-4 text-sm font-semibold text-slate-950">Source</h4>
          <ul className="space-y-3 text-sm text-slate-600">
            <li>
              <a
                className="hover:text-slate-950"
                href="https://github.com/Klaudiusz321/ConstantRecognition1"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub repository
              </a>
            </li>
            <li>Andrzej Odrzywolek and Klaudiusz Sroka</li>
            <li>Jagiellonian University</li>
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-7xl border-t border-slate-200 pt-6 text-xs text-slate-500">
        Built for reproducible numerical exploration, local execution, and
        transparent comparison with established constant-recognition tools.
      </div>
    </footer>
  );
}
