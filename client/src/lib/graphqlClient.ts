import { createClient, fetchExchange, subscriptionExchange } from "urql";
import { createClient as createWSClient } from "graphql-ws";
import { browserApiKey } from "./queryClient";

const wsClient = createWSClient({
  url: `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/graphql`,
});

export const graphqlClient = createClient({
  url: "/api/graphql",
  exchanges: [
    fetchExchange,
    subscriptionExchange({
      forwardSubscription(request) {
        const input = { ...request, query: request.query ?? "" };
        return {
          subscribe(sink) {
            const unsubscribe = wsClient.subscribe(input, sink);
            return { unsubscribe };
          },
        };
      },
    }),
  ],
  fetchOptions: () => {
    // Auth header if ULTRA_API_KEY is needed
    const key = browserApiKey();
    return key ? { headers: { Authorization: `Bearer ${key}` } } : {};
  },
});
