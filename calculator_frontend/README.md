# Constant Recognition Frontend

Next.js frontend for the Constant Recognition inverse symbolic calculator.

The site has two layers:

- Marketing and documentation routes: `/`, `/examples`, `/compare`, `/docs`, `/blog`
- Fullscreen calculator application: `/calculator`

The calculator runs locally in the browser through WebAssembly workers, with an experimental WebGPU backend when supported by the browser and hardware.

## Development

```powershell
npm install
npm run dev
```

## Production build

```powershell
npm run build
```

The project uses `output: "export"`, so the production site is emitted to `out/` and can be served by any static HTTP server. Serve it from a web root or configure `NEXT_PUBLIC_BASE_PATH` for subdirectory hosting.

## SEO and public URLs

Set `NEXT_PUBLIC_SITE_URL` to the canonical public URL before building:

```powershell
$env:NEXT_PUBLIC_SITE_URL = "https://example.org/constant-recognition"
npm run build
```

Generated SEO routes include:

- `/robots.txt`
- `/sitemap.xml`
- `/manifest.webmanifest`
- Open Graph and Twitter preview images in `public/`
- favicon, 192px icon, 512px icon, and Apple touch icon

## Hosting in a subdirectory

If the exported site is hosted under a path such as `https://example.org/~user/WASM/calculator/`, set both the canonical site URL and the Next.js base path:

```powershell
$env:NEXT_PUBLIC_SITE_URL = "https://example.org/~user/WASM/calculator"
$env:NEXT_PUBLIC_BASE_PATH = "/~user/WASM/calculator"
npm run build
```

Copy the contents of `out/` to the target directory. No Node.js runtime is required on the production server.

## Netlify

`../netlify.toml` is configured for static export:

- build base: `calculator_frontend`
- command: `npm run build`
- publish directory: `out`

Configure the real production `NEXT_PUBLIC_SITE_URL` in Netlify project settings before indexing the site.

## Citation

If the tool supports a publication or lecture material, cite the repository and include the target value, precision assumption, backend, search depth, and candidate expression used in the result.
