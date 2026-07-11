import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit reads its font metrics (.afm) files from disk at runtime using paths relative
  // to its own package folder. Left to the default webpack bundling, Vercel's serverless
  // build can drop those non-JS files and the charter PDF export breaks in production
  // even though it works locally. Marking it external keeps it as a plain node_modules
  // require at runtime so those files stay alongside the code that needs them.
  // pptxgenjs depends on a package literally named "https" (not Node's built-in module)
  // plus jszip/image-size — bundling these through webpack/Turbopack can break the
  // PowerPoint export in a way that only shows up on Vercel, not locally. Same fix as
  // pdfkit above: keep it external so it's a plain node_modules require at runtime.
  serverExternalPackages: ["pdfkit", "pptxgenjs"],

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
