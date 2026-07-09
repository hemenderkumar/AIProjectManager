import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit reads its font metrics (.afm) files from disk at runtime using paths relative
  // to its own package folder. Left to the default webpack bundling, Vercel's serverless
  // build can drop those non-JS files and the charter PDF export breaks in production
  // even though it works locally. Marking it external keeps it as a plain node_modules
  // require at runtime so those files stay alongside the code that needs them.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
