# AI-Based Real-Time Sign Language Recognition — Plan

Frontend-only build (no Lovable Cloud). All data persisted in `localStorage` via a typed store layer so swapping to a real backend later is a single-file change. Real webcam feed with MediaPipe Hands landmark overlay; gesture labels are mocked behind a clean API service so swapping to `POST /predict` later requires no UI changes.

## Visual direction

Light, clean, accessibility-first SaaS aesthetic.

- Background: near-white with soft neutral surfaces; subtle elevation, not glassmorphism-heavy.
- Accent: a single calm indigo/teal primary; success/warn/error tokens for status.
- Typography: Inter for UI, larger base size (16px), generous line-height.
- Strong focus rings, WCAG AA contrast everywhere, motion kept subtle and `prefers-reduced-motion` respected.
- shadcn/ui components themed via `src/styles.css` design tokens (no hardcoded colors).

## Pages & routing (TanStack Start, file-based)

Public:

- `/` Home — hero, features, how it works, stats, testimonials, footer
- `/login`, `/register`, `/forgot-password`, `/reset-password`
- `/feedback` (also reachable signed-in)

Authenticated (`_authenticated` layout with sidebar + header):

- `/dashboard` — welcome, quick stats, recent activity, mini charts, system status
- `/recognition` — core page (camera + MediaPipe + mock predictions)
- `/history` — searchable/filterable prediction table with pagination + CSV export
- `/analytics` — charts (Recharts)
- `/profile` — info, settings, password, usage
- `/feedback` — submit + list own feedback

Admin (`_authenticated/_admin` layout, role check):

- `/admin` overview
- `/admin/users`, `/admin/predictions`, `/admin/feedback`, `/admin/logs`

Each route gets its own `head()` with unique title/description.

## Auth (mocked)

- `useAuth` context backed by `localStorage`.
- Register/login with zod-validated forms; passwords hashed client-side with SubtleCrypto (demo only, clearly noted).
- Seed an `admin@demo.local / admin` user on first load so admin panel is reachable.
- Forgot-password flow generates a token in `localStorage` and the reset link is shown inline (no email).
- `_authenticated` guard via `beforeLoad` + redirect to `/login?redirect=…`.
- `_admin` guard via role check.

## Recognition page (the core)

- `getUserMedia` live video with start/stop/reset controls and clear permission states.
- MediaPipe Hands (`@mediapipe/tasks-vision`) loaded lazily; landmarks drawn on an overlay `<canvas>` in sync with the video.
- A `RecognitionEngine` service emits a mocked prediction (~every 1.2s when a hand is detected) with realistic gesture labels (Hello, Thanks, Yes, No, Please, I love you, A–Z subset) and confidence 0.7–0.99.
- UI: current prediction card, confidence meter, live caption strip (assembled text), session timer, live feed of recent predictions, session summary, export CSV.
- All predictions written through the same `predictionsService` used by History/Analytics.

## API service layer (swap-ready)

`src/services/api/` with:

- `recognitionApi.ts` — `predict(frame)`, `savePrediction()`, `getHistory()`, `getAnalytics()`. Today these call local mock implementations; later they switch to `fetch('/predict')` etc. without component changes.
- `mock/` — deterministic-ish mock generators.
- `storage/` — localStorage-backed repositories for users, predictions, sessions, feedback, logs.

## State management

- React Context for: Auth, Theme (light/dark toggle even though default is light), Notifications.
- TanStack Query for all data reads/writes against the service layer (so a real API later is drop-in).
- Recognition page uses local component state + a small `useRecognitionSession` hook.

## Notifications

`sonner` toasts: success/error/warning/info helpers in `src/lib/notify.ts`.

## Accessibility

- Semantic landmarks, single `<main>`, skip-link.
- Full keyboard nav, visible focus rings, `aria-label` on all icon buttons.
- Live region (`aria-live="polite"`) announces new predictions on the Recognition page.
- Respects `prefers-reduced-motion` and `prefers-color-scheme`.
- Form errors associated with inputs via `aria-describedby`.

## Charts

Recharts for: accuracy trend (line), recognition frequency (bar), top gestures (horizontal bar), daily usage (area), confidence distribution (bar).

## Tech notes

- TanStack Router file-based routes under `src/routes/` (no `src/pages/`).
- shadcn/ui sidebar for the authenticated layout with collapsible icon mode.
- Zod for all form validation.
- `date-fns` for timestamps.
- MediaPipe loaded dynamically inside the Recognition route only (keeps initial bundle small).

## Future backend readiness

- Single `apiClient.ts` with a base URL constant — flip mocks → real by changing one flag.
- Service interfaces typed so a real Cloud/Supabase swap = replace `storage/` repos only.
- All payloads already match the documented `/predict`, `/history`, `/save-prediction`, `/analytics` shapes.

## Build order

1. Design tokens + theme, app shell (root, sidebar layout, header, theme toggle, notifications).
2. Auth (context, forms, guards, seeded admin).
3. Storage repos + API service layer + mock data seeders.
4. Home + Dashboard.
5. Recognition page (camera → MediaPipe → mock engine → predictions pipeline).
6. History + Analytics.
7. Profile + Feedback.
8. Admin panel.
9. Accessibility pass + polish.  
  
Build a complete, production-ready, modern web application for an AI-Based Real-Time Sign Language Recognition System. The application should focus on accessibility, usability, responsiveness, and future scalability.
  ## Project Objective
  The system helps bridge communication barriers by recognizing sign language gestures in real time and converting them into readable text. The web application should serve as the frontend and system management portal while being fully prepared for integration with an external AI-powered gesture recognition backend.
  The application must be designed in a way that allows future integration with:
  - Computer Vision-based hand detection
  - MediaPipe hand landmark tracking
  - Deep Learning gesture recognition models
  - Real-time webcam processing
  - REST API-based prediction services
  The frontend should be fully functional even before the AI model is integrated.
  ---
  # Design Requirements
  Create a premium modern UI.
  Features:
  - Responsive design for desktop, tablet, and mobile
  - Accessibility-focused interface
  - Professional AI product appearance
  - Smooth animations and transitions
  - Clean dashboard layout
  - Modern card-based design
  - Dark Mode and Light Mode support
  - Glassmorphism effects where appropriate
  - Modern typography
  - Professional color palette
  The UI should look similar to a commercial SaaS platform rather than a student project.
  ---
  # Authentication System
  Implement complete authentication functionality.
  Features:
  - User Registration
  - Login
  - Logout
  - Forgot Password
  - Password Reset
  - Session Management
  - Protected Routes
  User roles:
  - User
  - Admin
  ---
  # Database Design
  Create all required database tables and relationships.
  ## Users Table
  Store:
  - User ID
  - Full Name
  - Email
  - Password
  - Role
  - Created Date
  - Last Login
  ---
  ## Predictions Table
  Store:
  - Prediction ID
  - User ID
  - Predicted Gesture
  - Predicted Text
  - Confidence Score
  - Prediction Timestamp
  - Processing Time
  ---
  ## Recognition Sessions Table
  Store:
  - Session ID
  - User ID
  - Session Start Time
  - Session End Time
  - Total Predictions
  - Average Confidence
  ---
  ## Feedback Table
  Store:
  - Feedback ID
  - User ID
  - Message
  - Rating
  - Timestamp
  ---
  ## System Logs Table
  Store:
  - Log ID
  - Event Type
  - Description
  - Timestamp
  ---
  # Navigation Structure
  Create the following pages.
  ## Home Page
  Include:
  Hero Section:
  - Project introduction
  - Call-to-action buttons
  - Accessibility-focused messaging
  Features Section:
  - Real-Time Recognition
  - AI-Powered Detection
  - Gesture-to-Text Conversion
  - High Accuracy Recognition
  - Accessibility Support
  How It Works Section:
  1. Start Camera
  2. Detect Hand Gesture
  3. AI Recognition
  4. Text Generation
  Statistics Section:
  - Recognition Accuracy
  - Supported Gestures
  - Active Users
  Testimonials Section
  Footer
  ---
  ## Dashboard Page
  Display:
  Welcome Section
  Quick Stats:
  - Total Predictions
  - Today's Predictions
  - Average Confidence
  - Total Sessions
  Recent Activity
  Recognition Usage Analytics
  Performance Summary Cards
  Prediction History Preview
  System Status Widget
  ---
  ## Recognition Page
  This is the core feature page.
  Create:
  Live Camera Section
  Camera Control Buttons:
  - Start Camera
  - Stop Camera
  - Reset Session
  Recognition Result Card:
  - Current Prediction
  - Confidence Score
  - Recognition Status
  Live Recognition Feed
  Prediction Timeline
  Recognition History Table
  Session Summary
  Export Results Button
  Important:
  For now, use mock AI responses.
  Create the architecture so that future API integration can easily replace the mock data.
  ---
  ## Prediction History Page
  Display:
  Search Functionality
  Filters:
  - Date
  - Confidence Score
  - Gesture Type
  Table Columns:
  - Gesture
  - Prediction
  - Confidence
  - Timestamp
  Pagination
  Export Data
  ---
  ## Analytics Page
  Create visual analytics dashboards.
  Charts:
  Prediction Accuracy Trend
  Recognition Frequency
  Most Recognized Gestures
  Daily Usage Statistics
  Monthly Performance Reports
  Average Confidence Metrics
  ---
  ## User Profile Page
  Display:
  Profile Information
  Account Settings
  Password Management
  Usage Statistics
  Recognition Activity
  ---
  ## Feedback Page
  Allow users to:
  Submit Feedback
  Rate Recognition Quality
  Report Issues
  Request Features
  ---
  ## Admin Panel
  Create a separate admin dashboard.
  Admin Features:
  Manage Users
  Manage Predictions
  View System Logs
  Manage Feedback
  Analytics Overview
  System Monitoring
  Role Management
  ---
  # AI Integration Architecture
  Design the application around future AI backend integration.
  Prepare API service architecture.
  Expected Endpoints:
  POST /predict
  Purpose:  
  Send captured gesture data and receive prediction results.
  Response Example:
  Current Gesture
  Predicted Text
  Confidence Score
  Processing Time
  ---
  GET /history
  Fetch prediction history.
  ---
  POST /save-prediction
  Store recognition results.
  ---
  GET /analytics
  Retrieve system analytics.
  ---
  The application must have a centralized API service layer so future backend integration requires minimal frontend modifications.
  ---
  # Recognition Workflow
  Design the frontend workflow as follows:
  User Opens Recognition Page
  ↓
  User Starts Camera
  ↓
  Camera Feed Becomes Active
  ↓
  Gesture Frames Captured
  ↓
  Frames Sent To Recognition API
  ↓
  Prediction Returned
  ↓
  Result Displayed
  ↓
  Prediction Saved To History
  ↓
  Analytics Updated
  ---
  # State Management
  Implement proper state management for:
  Authentication State
  Recognition State
  Prediction State
  Session State
  Theme State
  User State
  Loading State
  Error State
  ---
  # Notifications
  Implement notification system.
  Types:
  - Success Notifications
  - Error Notifications
  - Warning Notifications
  - Information Notifications
  Use toast notifications throughout the application.
  ---
  # Security Features
  Implement:
  Protected Routes
  Role-Based Access
  Input Validation
  Form Validation
  Secure Authentication Flow
  Session Expiration Handling
  ---
  # Accessibility Features
  Include:
  Keyboard Navigation
  Screen Reader Support
  Accessible Forms
  High Contrast Support
  Responsive Text Scaling
  Accessible Color Ratios
  ---
  # Performance Requirements
  Optimize for:
  Fast Loading
  Efficient Rendering
  Lazy Loading
  Reusable Components
  Scalable Architecture
  Clean Component Structure
  Maintainable Codebase
  ---
  # Future AI Expansion Readiness
  The system architecture must be designed so future integration of:
  - OpenCV
  - MediaPipe
  - TensorFlow Models
  - CNN Models
  - LSTM Models
  - Real-Time Webcam Processing
  - Sign-to-Text Translation
  - Speech Generation
  - Multi-Language Translation
  can be added without requiring major frontend redesign.

Ready to switch to build mode whenever you are.