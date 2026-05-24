import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import ScrollToTop from "./components/ScrollToTop";
import App from "./App";
import "./styles.css";
import "./styles-map.css";
import "./styles-map-hero.css";
import "./styles-animations.css";
import "./styles-grass-exam.css";
import "./styles-chat-photo.css";
import "./styles-dashboard.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <App />
    </BrowserRouter>
  </StrictMode>
);
