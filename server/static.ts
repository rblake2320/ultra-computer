import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Hashed assets (JS/CSS with content hashes in filename) — cache forever
  app.use(
    "/assets",
    express.static(path.join(distPath, "assets"), {
      maxAge: "1y",
      immutable: true,
      etag: false,        // Hash in filename is sufficient
      lastModified: false,
    })
  );

  // Other static files (index.html, favicon, etc.) — short cache with revalidation
  app.use(
    express.static(distPath, {
      maxAge: "5m",
      etag: true,
    })
  );

  // SPA fallback — always serve index.html for unmatched routes
  app.use("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
