# Calculator Frontend

This is a Next.js 16 frontend for the constant recognizer. The project is configured for **static export**, so running `npm run build` emits a fully static site in the `out/` directory that can be served by any plain HTTP server (no Node.js runtime needed at deploy time).

## Development
- Install dependencies: `npm install`
- Start the dev server: `npm run dev`

The calculator opens with a four-mode recognition wizard:

- one constant: one `z` value with the existing global uncertainty controls;
- multiple constants: at least two `z[, dz]` rows, executed through shared CPU/WASM `MODE_BATCH` or independent GPU searches with CPU verification;
- function: at least two `x, y[, dy]` rows, with the `x` terminal enabled automatically and weighted-MSE reporting.
- two-variable function: at least three `C1, C2, y[, dy]` rows, requiring both variables in every accepted expression.

The compute engine can be selected manually as Auto, GPU, or CPU. Run `npm test`, `npm run test:wasm-batch`, and `npm run build` before publishing frontend or WASM changes.

## Bounded search-memory contract

The production search is an exhaustive streaming enumerator, not the tensor prototype in `Julia/tensor_search.jl`. For one worker it keeps one RPN structure, one index vector, one evaluation stack and one best state per requested target. It never constructs an array of all candidate expressions or values. Workers receive small structure batches and return only their folded best records.

- CPU/WASM holds at most one live candidate expression and reports `memory_model`, `peak_live_expressions`, `retained_candidates` and `output_capacity_bytes` in every result.
- A batch retains exactly one best state and one final output row per target, capped at 512 targets.
- Function datasets are capped at 4096 rows per worker.
- The browser keeps at most 100 non-batch report rows and at most four equal-best formulas per `K`.
- GPU storage, staging readback and top-N retention follow the separate bounded contract in `docs/WEBGPU_SCIENTIFIC_AUDIT.md`.

`K` remains the exact RPN token count. The symbols `𝓛` (candidate likelihood) and `P(z)` (the statistical value-density model) from the constant-recognition criteria are scientific ranking/stopping quantities, not RAM controls. The UI's displayed `P = n^-K` is a simpler chance indicator. None of these quantities changes batch capacity or causes expressions to be stored. A future likelihood-based stop may reduce the number of evaluated formulas, but it must be exposed as a non-exhaustive scientific stopping rule rather than repurposed as a memory limit.

## Static production build
- Build the site: `npm run build`
  - The static files are written to `out/`
- Serve locally for a quick check (example): `npx serve@latest out`
- Deploy by copying the `out/` directory to any HTTP server (e.g., `nginx`, `httpd`, `python -m http.server`).

### Hosting in a subdirectory or behind a reverse proxy path
If the site will be served from a non-root path (for example `https://example.com/constant/`), build with the base
path baked in so all assets resolve correctly:

```
NEXT_PUBLIC_BASE_PATH=/constant npm run build
```

This sets both the Next.js `basePath` and the URLs used to load the WASM worker so the static files under `out/`
remain portable.

**Example for FreeBSD server**

Target URL: `http://th.if.uj.edu.pl/~odrzywolek/WASM/calculator/`

1. In PowerShell, set the base path (note: use the path portion, not the full URL):
   ```powershell
   $env:NEXT_PUBLIC_BASE_PATH = "/~odrzywolek/WASM/calculator"
   npm run build
   ```
2. Copy the generated `out/` directory to `http://th.if.uj.edu.pl/~odrzywolek/WASM/calculator/` on the server (so
   `out/index.html` ends up at `.../calculator/index.html`, `out/wasm/worker.js` at `.../calculator/wasm/worker.js`,
   etc.).
3. Serve the contents of `out/` with any HTTP server (Apache `httpd`, `nginx`, etc.) — no Node.js runtime is needed
   on the server because everything is static.

If you prefer to run the Next.js server instead of exporting static files, omit `output: "export"` in `next.config.ts` and use `npm run start` after `npm run build`.
