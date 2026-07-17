import type { NextConfig } from "next";

// Accepts values like "/constant" or "constant/" and normalizes them to
// "/constant". This keeps static exports portable when hosted in a subfolder.
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH;
const normalizedBasePath = rawBasePath
  ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`
  : undefined;

const nextConfig: NextConfig = {
  output: "export",
  basePath: normalizedBasePath,
  assetPrefix: normalizedBasePath,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  devIndicators: false,
  turbopack: {},
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    config.module.rules.push({
      test: /\.wasm$/,
      type: "webassembly/async",
    });

    return config;
  },
};

export default nextConfig;
