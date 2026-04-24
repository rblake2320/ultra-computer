import { createYoga } from "graphql-yoga";
import { schema } from "./schema.js";

export function createYogaMiddleware() {
  const yoga = createYoga({
    schema,
    graphqlEndpoint: "/api/graphql",
    // GraphiQL playground enabled in non-production
    graphiql: process.env.NODE_ENV !== "production",
    landingPage: false,
    // Use existing console for warnings/errors, suppress debug/info
    logging: {
      debug: () => {},
      info: () => {},
      warn: (...args: unknown[]) => console.warn("[graphql-yoga]", ...args),
      error: (...args: unknown[]) => console.error("[graphql-yoga]", ...args),
    },
  });

  return yoga;
}
