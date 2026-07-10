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
};

export default nextConfig;
