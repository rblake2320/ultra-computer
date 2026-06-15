import { createYoga } from "graphql-yoga";
import { Kind } from "graphql";
import type { ValidationContext, ASTNode } from "graphql";
import { GraphQLError } from "graphql";
import { schema } from "./schema.js";

// ─── Security: Query depth limiting ──────────────────────────────────────────
// Prevents deeply nested queries from exhausting resolver stack / DB joins.
// Alias attacks (same field N times) are bounded separately by maxAliasCount.

const MAX_QUERY_DEPTH = 10;
const MAX_ALIAS_COUNT = 20;  // per document

function getDepth(selectionSet: any, current: number): number {
  if (!selectionSet?.selections) return current;
  let max = current;
  for (const sel of selectionSet.selections) {
    if (sel.kind === Kind.FIELD && sel.selectionSet) {
      max = Math.max(max, getDepth(sel.selectionSet, current + 1));
    } else if (
      (sel.kind === Kind.INLINE_FRAGMENT || sel.kind === Kind.FRAGMENT_SPREAD) &&
      sel.selectionSet
    ) {
      max = Math.max(max, getDepth(sel.selectionSet, current));
    }
  }
  return max;
}

function queryDepthLimitRule(maxDepth: number) {
  return function MaxQueryDepth(ctx: ValidationContext) {
    return {
      OperationDefinition(node: ASTNode & { selectionSet?: any }) {
        const depth = getDepth(node.selectionSet, 0);
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

  const validationRules: any[] = [
    queryDepthLimitRule(MAX_QUERY_DEPTH),
    aliasLimitRule(MAX_ALIAS_COUNT),
    ...(isProd ? [noIntrospectionRule] : []),
  ];

  const yoga = createYoga({
    schema,
    graphqlEndpoint: "/api/graphql",
    graphiql: !isProd,
    landingPage: false,
    validationRules,
    logging: {
      debug: () => {},
      info: () => {},
      warn: (...args: unknown[]) => console.warn("[graphql-yoga]", ...args),
      error: (...args: unknown[]) => console.error("[graphql-yoga]", ...args),
    },
  });

  return yoga;
}
