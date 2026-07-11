import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit reads its font metrics (.afm) files from disk at runtime using paths relative
  // to its own package folder. Left to the default webpack bundling, Vercel's serverless
  // build can drop those non-JS files and the charter PDF export breaks in production
  // even though it works locally. Marking it external keeps it as a plain node_modules
  // require at runtime so those files stay alongside the code that needs them. pdfkit's
  // package.json only declares "main" (CommonJS) with no conditional "exports" map, so a
  // plain Node require() always resolves to the CJS build regardless of externalization
  // — safe to keep external.
  //
  // pptxgenjs must NOT be in this list. Its package.json declares a conditional "exports"
  // map ("import" -> dist/pptxgen.es.js, "require" -> dist/pptxgen.cjs.js). When it's
  // externalized, Turbopack's production runtime loads it via a synchronous external-module
  // loader that resolves the "import" condition (an ESM file) but then can't actually parse
  // ESM syntax, throwing "SyntaxError: Cannot use import statement outside a module" for
  // every route that touches it — confirmed directly from a production log:
  //   Failed to load external module pptxgenjs-...: SyntaxError: Cannot use import
  //   statement outside a module
  // Leaving it out of serverExternalPackages lets Turbopack bundle it normally (it can
  // parse ESM source at build time just fine); the failure only happens through the
  // external-require runtime path.
  serverExternalPackages: ["pdfkit"],

  // serverExternalPackages above stops webpack/Turbopack from bundling pdfkit, but Vercel's
  // separate file-tracing step (which decides which node_modules files actually get copied
  // into each deployed serverless function) does its own static analysis and can still miss
  // pdfkit's font-metrics (.afm) and ICC profile files — they're loaded via a runtime path
  // join, not a string literal require, so the tracer doesn't see them. Without this, every
  // PDF export (charter, reports, RFPs) 500s in production while working perfectly locally,
  // because the font data pdfkit needs simply isn't present on disk in the deployed function.
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/pdfkit/js/data/**"],
  },
};

export default nextConfig;
