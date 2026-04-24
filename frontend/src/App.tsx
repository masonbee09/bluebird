import "./App.css";

import { useState } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import TestPage from "./pages/test_page";
import FloorLevelSurveyPage from "./pages/floor_level_survey";
import { AuthProvider, useAuth } from "./auth/auth_context";
import { AuthGate } from "./auth/auth_gate";
import FeedbackDialog from "./components/feedback/feedback_dialog";


const pageTitles: Record<string, string> = {
    "/": "Home",
    "/test_page": "Test Page",
    "/floor_level_survey": "Floor Level Survey",
};


function AuthIndicator() {
    const { label, signOut } = useAuth();
    if (!label) {
        return (
            <button
                type="button"
                className="app-auth-signout"
                onClick={signOut}
                title="Sign out">
                Sign out
            </button>
        );
    }
    return (
        <div className="app-auth-indicator" role="group" aria-label="Signed in">
            <span className="app-auth-user" title={`Signed in as ${label}`}>
                <span className="app-auth-user-dot" aria-hidden="true" />
                {label}
            </span>
            <button
                type="button"
                className="app-auth-signout"
                onClick={signOut}
                title="Sign out">
                Sign out
            </button>
        </div>
    );
}


function AppShell() {
    const { pathname } = useLocation();
    const pageTitle = pageTitles[pathname] ?? "Unknown page";
    const [feedbackOpen, setFeedbackOpen] = useState(false);

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
                    <button
                        type="button"
                        className="app-feedback-btn"
                        onClick={() => setFeedbackOpen(true)}
                        title="Send feedback about Blue Bird (Beta)">
                        <span className="app-feedback-btn-icon" aria-hidden="true">
                            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 5h14v9H8l-4 3v-3H3z" />
                            </svg>
                        </span>
                        Feedback
                    </button>
                    <AuthIndicator />
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

            <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
        </>
    );
}


function App() {
    return (
        <AuthProvider>
            <AuthGate>
                <AppShell />
            </AuthGate>
        </AuthProvider>
    );
}

export default App;
