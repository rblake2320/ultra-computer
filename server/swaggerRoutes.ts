import { Express } from "express";
import path from "path";
import fs from "fs";

export function registerSwaggerRoutes(app: Express) {
  app.get("/api/docs/openapi.yaml", (req, res) => {
    const specPath = path.join(process.cwd(), "docs", "openapi.yaml");
    if (fs.existsSync(specPath)) {
      res.type("text/yaml").send(fs.readFileSync(specPath, "utf-8"));
    } else {
      res.status(404).json({ error: "OpenAPI spec not found" });
    }
  });

  app.get("/api/docs/openapi.json", (req, res) => {
    const specPath = path.join(process.cwd(), "docs", "openapi.yaml");
    if (fs.existsSync(specPath)) {
      const yaml = fs.readFileSync(specPath, "utf-8");
      res.type("text/yaml").send(yaml);
    } else {
      res.status(404).json({ error: "OpenAPI spec not found" });
    }
  });

  app.get("/api/docs", (req, res) => {
    res.type("html").send(`<!DOCTYPE html>
<html>
<head>
  <title>Ultra Computer API Docs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: "/api/docs/openapi.yaml",
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: "BaseLayout",
      deepLinking: true,
      defaultModelsExpandDepth: 2,
    });
  </script>
</body>
</html>`);
  });
}
