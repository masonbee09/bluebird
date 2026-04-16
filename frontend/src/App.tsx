import "./App.css";

import { Routes, Route, Link, useLocation } from "react-router-dom";
import TestPage from "./pages/test_page";
import FloorLevelSurveyPage from "./pages/floor_level_survey";


const pageTitles: Record<string, string> = {
    "/": "Home",
    "/test_page": "Test Page",
    "/floor_level_survey": "Floor Level Survey",
};


function App() {
    const { pathname } = useLocation();
    const pageTitle = pageTitles[pathname] ?? "Unknown page";

    return (
        <>
            <header className="app-topbar">
                <div className="app-topbar-left">
                    <Link to="/" className="app-brand" aria-label="Home">
                        <span className="app-brand-mark">BB</span>
                        <span>Blue Bird</span>
                    </Link>
                    <span className="app-title">{pageTitle}</span>
                </div>
                <nav className="app-nav">
                    <Link
                        to="/"
                        className={`app-nav-link${pathname === "/" ? " is-active" : ""}`}>
                        Home
                    </Link>
                    <Link
                        to="/test_page"
                        className={`app-nav-link${pathname === "/test_page" ? " is-active" : ""}`}>
                        Test Page
                    </Link>
                    <Link
                        to="/floor_level_survey"
                        className={`app-nav-link${pathname === "/floor_level_survey" ? " is-active" : ""}`}>
                        Floor Level Survey
                    </Link>
                </nav>
            </header>

            <main className="app-content">
                <Routes>
                    <Route
                        path="/"
                        element={
                            <div className="app-home">
                                <h2>Welcome</h2>
                                <p>
                                    Select a tool from the navigation above. The Floor Level Survey editor lets you lay
                                    out walls and elevation points on a snap-to-grid canvas, then solve for contours.
                                </p>
                            </div>
                        }
                    />
                    <Route path="/test_page" element={<TestPage />} />
                    <Route path="/floor_level_survey" element={<FloorLevelSurveyPage />} />
                </Routes>
            </main>
        </>
    );
}

export default App;
