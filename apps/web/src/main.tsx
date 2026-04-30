import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@excalidraw/excalidraw/index.css";
import "./excalidraw-overrides.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
