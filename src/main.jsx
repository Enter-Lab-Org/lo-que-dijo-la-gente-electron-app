import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import App from "./App";
import { createServices } from "./adapters";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App services={createServices(window)} />
  </StrictMode>,
);
