import App from "./App";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Provider } from "urql";
import { graphqlClient } from "./lib/graphqlClient.js";

createRoot(document.getElementById("root")!).render(
  <Provider value={graphqlClient}>
    <App />
  </Provider>
);
