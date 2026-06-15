import { createYoga } from "graphql-yoga";
import type { Plugin } from "graphql-yoga";
import { Kind } from "graphql";
import type { ValidationContext, ASTNode } from "graphql";
import { GraphQLError } from "graphql";
import { schema } from "./schema.js";

// ─── Security: Query depth limiting ──────────────────────────────────────────
// Prevents deeply nested queries from exhausting resolver stack / DB joins.
// Alias attacks (same field N times) are bounded separately by maxAliasCount.

const MAX_QUERY_DEPTH = 10;
const MAX_ALIAS_COUNT = 20;  // per document

function getDepth(
  selectionSet: any,
  current: number,
  fragments: Record<string, any>,
  seen: Set<string>
): number {
  if (!selectionSet?.selections) return current;
  let max = current;
  for (const sel of selectionSet.selections) {
    if (sel.kind === Kind.FIELD && sel.selectionSet) {
      max = Math.max(max, getDepth(sel.selectionSet, current + 1, fragments, seen));
    } else if (sel.kind === Kind.INLINE_FRAGMENT && sel.selectionSet) {
      max = Math.max(max, getDepth(sel.selectionSet, current, fragments, seen));
    } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
      // Resolve named fragment — avoids missing deeply nested spread depth
      const name = sel.name?.value;
      if (name && !seen.has(name)) {
        seen.add(name); // prevent infinite recursion on circular fragments
        const frag = fragments[name];
        if (frag?.selectionSet) {
          max = Math.max(max, getDepth(frag.selectionSet, current, fragments, seen));
        }
      }
    }
  }
  return max;
}

function queryDepthLimitRule(maxDepth: number) {
  return function MaxQueryDepth(ctx: ValidationContext) {
    // Build fragment map once per document for O(1) lookups during traversal
    const fragmentMap: Record<string, any> = {};
    for (const def of ctx.getDocument().definitions) {
      if (def.kind === Kind.FRAGMENT_DEFINITION) {
        fragmentMap[(def as any).name.value] = def;
      }
    }
    return {
      OperationDefinition(node: ASTNode & { selectionSet?: any }) {
        const depth = getDepth(node.selectionSet, 0, fragmentMap, new Set());
        if (depth > maxDepth) {
          ctx.reportError(new GraphQLError(
            `Query depth ${depth} exceeds maximum allowed depth of ${maxDepth}.`,
            { nodes: [node] }
          ));
        }
      }
    };
  };
}

function aliasLimitRule(maxAliases: number) {
  return function MaxAliasCount(ctx: ValidationContext) {
    return {
      Document(doc: ASTNode & { definitions?: any[] }) {
        let count = 0;
        const walk = (node: any) => {
          if (!node) return;
          if (node.alias) count++;
          if (node.selectionSet?.selections) node.selectionSet.selections.forEach(walk);
          if (Array.isArray(node.definitions)) node.definitions.forEach(walk);
        };
        walk(doc);
        if (count > maxAliases) {
          ctx.reportError(new GraphQLError(
            `Query uses ${count} aliases, exceeding the maximum of ${maxAliases}.`
          ));
        }
      }
    };
  };
}

// ─── Security: Disable introspection in production ───────────────────────────

function noIntrospectionRule(ctx: ValidationContext) {
  return {
    Field(node: ASTNode & { name?: { value: string } }) {
      if (node.name?.value === "__schema" || node.name?.value === "__type") {
        ctx.reportError(new GraphQLError(
          "GraphQL introspection is disabled in production."
        ));
      }
    }
  };
}

// ─── Yoga middleware factory ──────────────────────────────────────────────────

export function createYogaMiddleware() {
  const isProd = process.env.NODE_ENV === "production";

  const rules: ((ctx: ValidationContext) => any)[] = [
    queryDepthLimitRule(MAX_QUERY_DEPTH),
    aliasLimitRule(MAX_ALIAS_COUNT),
    ...(isProd ? [noIntrospectionRule] : []),
  ];

  // graphql-yoga v5 uses the onValidate plugin hook for custom validation rules
  // (validationRules option was removed from YogaServerOptions in v5).
  const validationPlugin: Plugin = {
    onValidate({ addValidationRule }: { addValidationRule: (rule: any) => void }) {
      for (const rule of rules) {
        addValidationRule(rule);
      }
    },
  };

  const yoga = createYoga({
    schema,
    graphqlEndpoint: "/api/graphql",
    graphiql: !isProd,
    landingPage: false,
    plugins: [validationPlugin],
    logging: {
      debug: () => {},
      info: () => {},
      warn: (...args: unknown[]) => console.warn("[graphql-yoga]", ...args),
      error: (...args: unknown[]) => console.error("[graphql-yoga]", ...args),
    },
  });

  return yoga;
}
