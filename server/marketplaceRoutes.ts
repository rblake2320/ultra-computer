/**
 * Marketplace Routes — Community Skill Registry
 * Publish, install, fork, search, rate, and version skills.
 */

import type { Express } from "express";
import { v4 as uuidv4 } from "uuid";
import { storage } from "./storage.js";
import { runScoringPipeline, scoreSkillById, getScoringConfig } from "./marketplaceScoring.js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

const VALID_CATEGORIES = ["general", "research", "code", "data", "writing", "devops", "design", "other"];
const VALID_SORT = ["newest", "popular", "rating", "quality"];

export function registerMarketplaceRoutes(app: Express) {

  // ─── Browse / Search ──────────────────────────────────────────────────────
  app.get("/api/marketplace/skills", (req, res) => {
    const category = req.query.category as string | undefined;
    const search = req.query.q as string | undefined;
    const sort = req.query.sort as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const skills = storage.getMarketplaceSkills({ category, search, sort, limit, offset });
    const total = storage.getMarketplaceSkills({ category, search }).length;
    res.json({ skills, total, limit, offset });
  });

  // ─── Get single skill detail ──────────────────────────────────────────────
  app.get("/api/marketplace/skills/:idOrSlug", (req, res) => {
    const param = req.params.idOrSlug;
    const skill = storage.getMarketplaceSkill(param) || storage.getMarketplaceSkillBySlug(param);
    if (!skill) return res.status(404).json({ error: "Skill not found" });

    // Include version history, ratings, and install status
    const versions = storage.getMarketplaceVersions(skill.id);
    const ratings = storage.getMarketplaceRatings(skill.id);
    const installed = storage.getMarketplaceInstallBySkill(skill.id);
    const avgRating = skill.ratingCount > 0 ? +(skill.ratingSum / skill.ratingCount).toFixed(1) : 0;

    res.json({ ...skill, versions, ratings, installed: installed || null, avgRating });
  });

  // ─── Publish a new skill ──────────────────────────────────────────────────
  app.post("/api/marketplace/skills", (req, res) => {
    const {
      name, description, longDescription, authorName, authorEmail,
      category, tags, license, repoUrl, visibility,
      content, skillType, language, triggerKeywords, version
    } = req.body ?? {};

    if (!name || !description || !authorName || !content) {
      return res.status(400).json({ error: "name, description, authorName, and content are required" });
    }
    if (typeof name !== "string" || name.length > 200) return res.status(400).json({ error: "name must be <= 200 chars" });
    if (typeof content !== "string" || content.length > 500_000) return res.status(400).json({ error: "content must be <= 500KB" });
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` });
    }

    // Generate unique slug
    let slug = slugify(name);
    let suffix = 0;
    while (storage.getMarketplaceSkillBySlug(slug + (suffix ? `-${suffix}` : ""))) {
      suffix++;
    }
    if (suffix) slug = `${slug}-${suffix}`;

    const id = uuidv4();
    const ver = version || "1.0.0";

    const skill = storage.createMarketplaceSkill({
      id,
      slug,
      name,
      description,
      longDescription: longDescription || "",
      authorName,
      authorEmail: authorEmail || null,
      authorAvatarUrl: null,
      category: category || "general",
      tags: Array.isArray(tags) ? JSON.stringify(tags) : (tags || "[]"),
      license: license || "MIT",
      repoUrl: repoUrl || null,
      currentVersion: ver,
      visibility: visibility || "public",
      forkedFromId: null,
      featured: false,
      verified: false,
    });

    // Create initial version record
    storage.createMarketplaceVersion({
      id: uuidv4(),
      skillId: id,
      version: ver,
      content,
      changelog: "Initial release",
      skillType: skillType || "instruction",
      language: language || null,
      triggerKeywords: Array.isArray(triggerKeywords) ? JSON.stringify(triggerKeywords) : (triggerKeywords || "[]"),
      fileSize: Buffer.byteLength(content, "utf8"),
    });

    res.json(skill);
  });

  // ─── Update skill metadata ───────────────────────────────────────────────
  app.patch("/api/marketplace/skills/:id", (req, res) => {
    const existing = storage.getMarketplaceSkill(req.params.id);
    if (!existing) return res.status(404).json({ error: "Skill not found" });

    // Explicit allowlist — no mass assignment via ...rest
    const ALLOWED_FIELDS = ["name", "description", "longDescription", "authorName", "authorEmail",
      "category", "license", "repoUrl", "visibility", "featured", "verified"] as const;
    const updateData: Record<string, any> = {};
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) {
        const val = req.body[field];
        if (typeof val === "string" && val.length > 10_000) {
          return res.status(400).json({ error: `${field} too long (max 10,000 chars)` });
        }
        updateData[field] = val;
      }
    }
    if (updateData.category && !VALID_CATEGORIES.includes(updateData.category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` });
    }
    if (req.body.tags !== undefined) {
      updateData.tags = Array.isArray(req.body.tags) ? JSON.stringify(req.body.tags) : req.body.tags;
    }

    const updated = storage.updateMarketplaceSkill(req.params.id, updateData);
    res.json(updated);
  });

  // ─── Publish new version ──────────────────────────────────────────────────
  app.post("/api/marketplace/skills/:id/versions", (req, res) => {
    const skill = storage.getMarketplaceSkill(req.params.id);
    if (!skill) return res.status(404).json({ error: "Skill not found" });

    const { version, content, changelog, skillType, language, triggerKeywords } = req.body;
    if (!version || !content) return res.status(400).json({ error: "version and content required" });
    if (typeof content !== "string" || content.length > 500_000) return res.status(400).json({ error: "content must be <= 500KB" });

    // Check for duplicate version
    const existing = storage.getMarketplaceVersions(skill.id);
    if (existing.some(v => v.version === version)) {
      return res.status(409).json({ error: `Version ${version} already exists` });
    }

    const ver = storage.createMarketplaceVersion({
      id: uuidv4(),
      skillId: skill.id,
      version,
      content,
      changelog: changelog || "",
      skillType: skillType || "instruction",
      language: language || null,
      triggerKeywords: Array.isArray(triggerKeywords) ? JSON.stringify(triggerKeywords) : (triggerKeywords || "[]"),
      fileSize: Buffer.byteLength(content, "utf8"),
    });

    // Update skill's current version
    storage.updateMarketplaceSkill(skill.id, { currentVersion: version } as any);

    // Re-score after new version published
    try { scoreSkillById(skill.id); } catch (scoreErr) { console.error('[marketplace] Scoring error for skill', skill.id, scoreErr); }

    res.json(ver);
  });

  // ─── Get versions ─────────────────────────────────────────────────────────
  app.get("/api/marketplace/skills/:id/versions", (req, res) => {
    const versions = storage.getMarketplaceVersions(req.params.id);
    res.json(versions);
  });

  // ─── Install a skill locally ──────────────────────────────────────────────
  app.post("/api/marketplace/skills/:id/install", (req, res) => {
    const skill = storage.getMarketplaceSkill(req.params.id);
    if (!skill) return res.status(404).json({ error: "Skill not found" });

    // Check if already installed
    const existing = storage.getMarketplaceInstallBySkill(skill.id);
    if (existing) return res.status(409).json({ error: "Already installed", install: existing });

    // Get latest version content
    const versions = storage.getMarketplaceVersions(skill.id);
    const latest = versions[0];
    if (!latest) return res.status(400).json({ error: "No versions available" });

    let localSkillId: string;
    let localType: string;

    if (latest.skillType === "script") {
      // Install as a skill script
      localSkillId = uuidv4();
      storage.createSkillScript({
        id: localSkillId,
        name: `[MP] ${skill.name}`,
        description: skill.description,
        language: latest.language || "bash",
        content: latest.content,
        tags: skill.tags,
        version: 1,
        sourceConversationId: null,
        sourceToolCallId: null,
        filePath: null,
        isFavorite: false,
      });
      localType = "script";
    } else {
      // Install as an instruction skill
      localSkillId = uuidv4();
      storage.createSkill({
        id: localSkillId,
        name: `[MP] ${skill.name}`,
        description: skill.description,
        content: latest.content,
        triggerKeywords: latest.triggerKeywords,
        embeddings: null,
        isBuiltIn: false,
        enabled: true,
      });
      localType = "instruction";
    }

    const install = storage.createMarketplaceInstall({
      id: uuidv4(),
      skillId: skill.id,
      localSkillId,
      localType,
      installedVersion: latest.version,
      autoUpdate: false,
    });

    storage.incrementMarketplaceInstallCount(skill.id);

    // Re-score this skill after install count changed
    try { scoreSkillById(skill.id); } catch (scoreErr) { console.error('[marketplace] Scoring error for skill', skill.id, scoreErr); }

    res.json(install);
  });

  // ─── Uninstall a skill ────────────────────────────────────────────────────
  app.post("/api/marketplace/skills/:id/uninstall", (req, res) => {
    const install = storage.getMarketplaceInstallBySkill(req.params.id);
    if (!install) return res.status(404).json({ error: "Not installed" });

    // Remove local skill
    if (install.localType === "script" && install.localSkillId) {
      storage.deleteSkillScript(install.localSkillId);
    } else if (install.localSkillId) {
      storage.deleteSkill(install.localSkillId);
    }

    storage.deleteMarketplaceInstall(install.id);
    res.json({ ok: true });
  });

  // ─── Get all installations ────────────────────────────────────────────────
  app.get("/api/marketplace/installs", (req, res) => {
    const installs = storage.getMarketplaceInstalls();
    res.json(installs);
  });

  // ─── Fork a skill ─────────────────────────────────────────────────────────
  app.post("/api/marketplace/skills/:id/fork", (req, res) => {
    const source = storage.getMarketplaceSkill(req.params.id);
    if (!source) return res.status(404).json({ error: "Skill not found" });

    const { authorName, authorEmail } = req.body;
    if (!authorName) return res.status(400).json({ error: "authorName required" });

    // Get latest version content
    const versions = storage.getMarketplaceVersions(source.id);
    const latest = versions[0];
    if (!latest) return res.status(400).json({ error: "No versions to fork" });

    // Create forked slug
    let slug = slugify(`${source.name}-fork`);
    let suffix = 0;
    while (storage.getMarketplaceSkillBySlug(slug + (suffix ? `-${suffix}` : ""))) {
      suffix++;
    }
    if (suffix) slug = `${slug}-${suffix}`;

    const forkId = uuidv4();
    const fork = storage.createMarketplaceSkill({
      id: forkId,
      slug,
      name: `${source.name} (Fork)`,
      description: source.description,
      longDescription: source.longDescription,
      authorName,
      authorEmail: authorEmail || null,
      authorAvatarUrl: null,
      category: source.category,
      tags: source.tags,
      license: source.license,
      repoUrl: null,
      currentVersion: "1.0.0",
      visibility: "public",
      forkedFromId: source.id,
      featured: false,
      verified: false,
    });

    // Copy latest version content
    storage.createMarketplaceVersion({
      id: uuidv4(),
      skillId: forkId,
      version: "1.0.0",
      content: latest.content,
      changelog: `Forked from ${source.name} v${latest.version}`,
      skillType: latest.skillType,
      language: latest.language,
      triggerKeywords: latest.triggerKeywords,
      fileSize: latest.fileSize,
    });

    storage.incrementMarketplaceForkCount(source.id);

    // Score both the source (fork count changed) and the new fork
    try {
      scoreSkillById(source.id);
      scoreSkillById(forkId);
    } catch (scoreErr) { console.error('[marketplace] Scoring error on fork', source.id, forkId, scoreErr); }

    res.json(fork);
  });

  // ─── Rate a skill ─────────────────────────────────────────────────────────
  app.post("/api/marketplace/skills/:id/rate", (req, res) => {
    const skill = storage.getMarketplaceSkill(req.params.id);
    if (!skill) return res.status(404).json({ error: "Skill not found" });

    const { rating, review, userId } = req.body;
    if (!rating || !userId) return res.status(400).json({ error: "rating and userId required" });
    // Use Number() instead of parseInt() to correctly handle non-integer strings
    const ratingNum = Number(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) return res.status(400).json({ error: "rating must be 1-5" });

    // Check for existing rating by this user
    const existing = storage.getMarketplaceRatingByUser(skill.id, userId);
    if (existing) {
      // Update existing rating
      const oldRating = existing.rating;
      storage.updateMarketplaceRatingRecord(existing.id, { rating: ratingNum, review: review || existing.review });
      storage.updateMarketplaceRating(skill.id, ratingNum - oldRating, 0);
      // Re-score after rating update
      try { scoreSkillById(skill.id); } catch (scoreErr) { console.error('[marketplace] Scoring error for skill', skill.id, scoreErr); }
      const updated = storage.getMarketplaceRatingByUser(skill.id, userId);
      return res.json(updated);
    }

    // New rating
    const ratingRecord = storage.createMarketplaceRating({
      id: uuidv4(),
      skillId: skill.id,
      userId,
      rating: ratingNum,
      review: review || null,
    });

    storage.updateMarketplaceRating(skill.id, ratingNum, 1);

    // Re-score after new rating
    try { scoreSkillById(skill.id); } catch (scoreErr) { console.error('[marketplace] Scoring error for skill', skill.id, scoreErr); }

    res.json(ratingRecord);
  });

  // ─── Get ratings ──────────────────────────────────────────────────────────
  app.get("/api/marketplace/skills/:id/ratings", (req, res) => {
    const ratings = storage.getMarketplaceRatings(req.params.id);
    res.json(ratings);
  });

  // ─── Delete a marketplace skill ───────────────────────────────────────────
  app.delete("/api/marketplace/skills/:id", (req, res) => {
    const skill = storage.getMarketplaceSkill(req.params.id);
    if (!skill) return res.status(404).json({ error: "Skill not found" });
    storage.deleteMarketplaceSkill(req.params.id);
    res.json({ ok: true });
  });

  // ─── Scoring API ──────────────────────────────────────────────────────────

  // Run full scoring pipeline across all skills
  app.post("/api/marketplace/scoring/run", (req, res) => {
    try {
      const result = runScoringPipeline();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: "Scoring pipeline failed", details: err.message });
    }
  });

  // Get score breakdown for a single skill
  app.get("/api/marketplace/skills/:id/score", (req, res) => {
    const breakdown = scoreSkillById(req.params.id);
    if (!breakdown) return res.status(404).json({ error: "Skill not found" });
    res.json(breakdown);
  });

  // Get scoring configuration (weights, tiers, priors)
  app.get("/api/marketplace/scoring/config", (req, res) => {
    res.json(getScoringConfig());
  });

  // ─── Marketplace stats ────────────────────────────────────────────────────
  app.get("/api/marketplace/stats", (req, res) => {
    const all = storage.getMarketplaceSkills();
    const categories: Record<string, number> = {};
    let totalInstalls = 0;
    for (const s of all) {
      categories[s.category] = (categories[s.category] || 0) + 1;
      totalInstalls += s.installCount;
    }
    // Compute tier distribution from scoring data
    const tierDistribution: Record<string, number> = { platinum: 0, gold: 0, silver: 0, bronze: 0, unranked: 0 };
    for (const s of all) {
      const tier = (s as any).scoreTier || "unranked";
      tierDistribution[tier] = (tierDistribution[tier] || 0) + 1;
    }

    res.json({
      totalSkills: all.length,
      totalInstalls,
      categories,
      featured: all.filter(s => s.featured).length,
      verified: all.filter(s => s.verified).length,
      tierDistribution,
    });
  });

  // ─── Seed sample marketplace skills ───────────────────────────────────────
  app.post("/api/marketplace/seed", (req, res) => {
    // Block seeding in production to prevent overwriting live data
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Seeding is not allowed in production" });
    }
    const existing = storage.getMarketplaceSkills();
    if (existing.length > 0) return res.json({ message: "Already seeded", count: existing.length });

    const sampleSkills = [
      {
        name: "API Security Auditor",
        description: "Scans API endpoints for OWASP Top 10 vulnerabilities, auth weaknesses, and rate-limit gaps.",
        category: "devops",
        tags: ["security", "api", "owasp", "audit"],
        content: "# API Security Auditor\n\n## When to activate\nActivate when user asks to audit, review, or test API security.\n\n## Methodology\n1. Check authentication mechanisms (JWT, OAuth, API keys)\n2. Test for injection vulnerabilities (SQL, NoSQL, command)\n3. Verify rate limiting and throttling\n4. Check CORS configuration\n5. Test for data exposure in error messages\n6. Verify input validation on all endpoints\n\n## Output\n- Severity-ranked findings (Critical/High/Medium/Low)\n- Remediation steps for each finding\n- OWASP category mapping",
        triggerKeywords: ["security", "audit", "api", "vulnerability", "owasp", "pentest"],
        authorName: "SecurityBot",
      },
      {
        name: "SQL Query Optimizer",
        description: "Analyzes SQL queries for performance issues and suggests index strategies and rewrites.",
        category: "data",
        tags: ["sql", "database", "performance", "optimization"],
        content: "# SQL Query Optimizer\n\n## When to activate\nActivate when user shares SQL queries for review or mentions slow queries.\n\n## Analysis steps\n1. Parse query structure (JOINs, subqueries, aggregations)\n2. Identify missing indexes based on WHERE/JOIN/ORDER BY\n3. Check for N+1 patterns and suggest batching\n4. Recommend query rewrites (CTEs, window functions)\n5. Estimate cardinality and selectivity\n\n## Output format\n- Original query with annotated issues\n- Optimized query\n- Recommended indexes (CREATE INDEX statements)\n- Expected performance improvement estimate",
        triggerKeywords: ["sql", "query", "optimize", "slow", "index", "database", "performance"],
        authorName: "DataEngineer",
      },
      {
        name: "Git Commit Reviewer",
        description: "Reviews git diffs for code quality, security issues, and style consistency.",
        category: "code",
        tags: ["git", "code-review", "quality", "security"],
        content: "# Git Commit Reviewer\n\n## When to activate\nActivate when user shares a git diff, PR, or asks for code review.\n\n## Review checklist\n1. **Security** — secrets, injection, auth bypasses\n2. **Logic** — edge cases, off-by-one, null handling\n3. **Performance** — O(n\u00b2) loops, unnecessary allocations\n4. **Style** — naming, structure, DRY violations\n5. **Tests** — coverage gaps, missing edge cases\n6. **Docs** — outdated comments, missing JSDoc\n\n## Output\nFor each finding:\n- File + line number\n- Severity (blocker/warning/nit)\n- Explanation and fix suggestion",
        triggerKeywords: ["review", "diff", "commit", "pull-request", "code-review", "git"],
        authorName: "CodeReviewBot",
      },
      {
        name: "Meeting Notes Synthesizer",
        description: "Extracts action items, decisions, and key topics from meeting transcripts.",
        category: "writing",
        tags: ["meetings", "notes", "action-items", "summary"],
        content: "# Meeting Notes Synthesizer\n\n## When to activate\nActivate when user pastes a meeting transcript or asks to summarize meeting notes.\n\n## Processing\n1. Identify participants and their roles\n2. Extract key topics discussed\n3. List all decisions made (with who decided)\n4. Extract action items with owners and deadlines\n5. Note unresolved questions or parking lot items\n\n## Output format\n### Summary (2-3 sentences)\n### Decisions\n### Action Items (owner | item | deadline)\n### Key Discussion Points\n### Open Questions",
        triggerKeywords: ["meeting", "transcript", "notes", "action-items", "summary", "minutes"],
        authorName: "ProductivityBot",
      },
      {
        name: "Terraform Module Scaffolder",
        description: "Generates production-ready Terraform modules with variables, outputs, and README.",
        category: "devops",
        tags: ["terraform", "iac", "infrastructure", "aws", "cloud"],
        content: "# Terraform Module Scaffolder\n\n## When to activate\nActivate when user asks to create a Terraform module or infrastructure as code.\n\n## Generation rules\n1. Use variables for all configurable values\n2. Add sensible defaults where appropriate\n3. Include outputs for key resource attributes\n4. Add lifecycle blocks for zero-downtime updates\n5. Include tagging strategy (Name, Environment, Team, ManagedBy)\n6. Generate README with usage examples\n\n## File structure\n- main.tf (resources)\n- variables.tf (inputs)\n- outputs.tf (outputs)\n- versions.tf (provider constraints)\n- README.md (usage + examples)",
        triggerKeywords: ["terraform", "infrastructure", "iac", "module", "aws", "cloud", "devops"],
        authorName: "InfraBot",
      },
      {
        name: "Regex Builder",
        description: "Builds and explains regular expressions step-by-step with test cases.",
        category: "code",
        tags: ["regex", "pattern", "parsing", "validation"],
        content: "# Regex Builder\n\n## When to activate\nActivate when user needs help writing or understanding regular expressions.\n\n## Approach\n1. Understand the pattern requirements from examples\n2. Build regex incrementally, explaining each part\n3. Provide named capture groups where useful\n4. Include test cases that match and don't match\n5. Note performance considerations (backtracking, catastrophic regex)\n\n## Output\n- The regex pattern with inline comments\n- Step-by-step breakdown of each component\n- Test cases table (input | match? | captured groups)\n- Language-specific usage (JS, Python, Go)",
        triggerKeywords: ["regex", "regular-expression", "pattern", "match", "parse", "validate"],
        authorName: "RegexMaster",
      },
      {
        name: "Color Palette Generator",
        description: "Creates harmonious color palettes with accessibility checks and CSS variables.",
        category: "design",
        tags: ["color", "palette", "design", "accessibility", "css"],
        content: "# Color Palette Generator\n\n## When to activate\nActivate when user asks for color palettes, theme colors, or design system colors.\n\n## Generation rules\n1. Start from a base hue (inferred from brand or mood)\n2. Generate 5-shade scale per color (50-900)\n3. Ensure WCAG AA contrast ratios for text combinations\n4. Include semantic mappings (primary, secondary, success, warning, error)\n5. Provide both light and dark mode variants\n\n## Output\n- Color swatches with hex, HSL, and RGB values\n- CSS custom properties (--color-primary-500: ...)\n- Tailwind config extension\n- Contrast ratio matrix for text/background combos\n- Accessibility pass/fail indicators",
        triggerKeywords: ["color", "palette", "theme", "design", "css", "tailwind", "accessibility"],
        authorName: "DesignBot",
      },
      {
        name: "Changelog Generator",
        description: "Generates conventional changelog entries from git commits or feature descriptions.",
        category: "writing",
        tags: ["changelog", "release", "documentation", "versioning"],
        content: "# Changelog Generator\n\n## When to activate\nActivate when user asks to generate a changelog, release notes, or version summary.\n\n## Format\nFollow Keep a Changelog (keepachangelog.com) format:\n### Added — new features\n### Changed — changes in existing functionality\n### Deprecated — soon-to-be removed features\n### Removed — removed features\n### Fixed — bug fixes\n### Security — vulnerability patches\n\n## Rules\n- Group by category, not by date\n- Write from the user's perspective\n- Link to issues/PRs where available\n- Use present tense (\"Add\", not \"Added\")\n- Include breaking changes prominently",
        triggerKeywords: ["changelog", "release", "notes", "version", "update", "whats-new"],
        authorName: "ReleaseBot",
      },
      {
        name: "CSV Data Cleaner",
        description: "Detects and fixes common data quality issues in CSV files — duplicates, missing values, type mismatches.",
        category: "data",
        tags: ["csv", "data-cleaning", "etl", "quality"],
        content: "# CSV Data Cleaner\n\n## When to activate\nActivate when user uploads CSV data or asks to clean/fix data quality.\n\n## Cleaning pipeline\n1. **Profile** — row count, column types, null %, cardinality\n2. **Duplicates** — exact and fuzzy duplicate detection\n3. **Missing values** — impute, drop, or flag strategies\n4. **Type coercion** — dates, numbers, booleans\n5. **Outliers** — z-score and IQR methods\n6. **Standardization** — trim whitespace, normalize casing, fix encoding\n\n## Output\n- Data quality report (before/after metrics)\n- Cleaning script (Python/pandas)\n- Cleaned dataset\n- List of changes made with row references",
        triggerKeywords: ["csv", "clean", "data-quality", "duplicates", "missing", "etl", "transform"],
        authorName: "DataBot",
      },
      {
        name: "Competitive Analysis Framework",
        description: "Structured framework for analyzing competitors — features, pricing, positioning, and SWOT.",
        category: "research",
        tags: ["competitive", "analysis", "strategy", "market", "swot"],
        content: "# Competitive Analysis Framework\n\n## When to activate\nActivate when user asks to analyze competitors or compare products/companies.\n\n## Framework\n1. **Identification** — Direct, indirect, and aspirational competitors\n2. **Feature matrix** — Side-by-side comparison table\n3. **Pricing analysis** — Tier comparison, value per dollar\n4. **Positioning** — Target audience, messaging, unique value prop\n5. **SWOT** — Strengths, Weaknesses, Opportunities, Threats per competitor\n6. **Market share** — Estimated relative position\n\n## Output\n- Executive summary with key findings\n- Feature comparison table\n- Pricing comparison table\n- Positioning map (2x2 matrix)\n- SWOT for top 3 competitors\n- Recommended differentiators",
        triggerKeywords: ["competitor", "competitive", "analysis", "compare", "market", "swot", "positioning"],
        authorName: "StrategyBot",
      },
    ];

    for (const s of sampleSkills) {
      const id = uuidv4();
      const slug = slugify(s.name);
      storage.createMarketplaceSkill({
        id,
        slug,
        name: s.name,
        description: s.description,
        longDescription: "",
        authorName: s.authorName,
        authorEmail: null,
        authorAvatarUrl: null,
        category: s.category,
        tags: JSON.stringify(s.tags),
        license: "MIT",
        repoUrl: null,
        currentVersion: "1.0.0",
        visibility: "public",
        forkedFromId: null,
        featured: ["API Security Auditor", "SQL Query Optimizer", "Competitive Analysis Framework"].includes(s.name),
        verified: ["API Security Auditor", "SQL Query Optimizer", "Git Commit Reviewer"].includes(s.name),
      });

      storage.createMarketplaceVersion({
        id: uuidv4(),
        skillId: id,
        version: "1.0.0",
        content: s.content,
        changelog: "Initial release",
        skillType: "instruction",
        language: null,
        triggerKeywords: JSON.stringify(s.triggerKeywords),
        fileSize: Buffer.byteLength(s.content, "utf8"),
      });

      // Add some fake install counts for realistic feel
      const fakeInstalls = Math.floor(Math.random() * 500) + 10;
      const fakeRatingCount = Math.floor(Math.random() * 50) + 3;
      const fakeRatingSum = Math.floor(fakeRatingCount * (3.5 + Math.random() * 1.5));
      storage.updateMarketplaceSkill(id, {
        installCount: fakeInstalls,
        ratingSum: fakeRatingSum,
        ratingCount: fakeRatingCount,
      } as any);
    }

    // Run scoring pipeline after seeding to compute real scores
    const scoringResult = runScoringPipeline();

    res.json({ message: "Seeded marketplace", count: sampleSkills.length, scoring: scoringResult.tierDistribution });
  });
}
