# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BirdQuest is a gamified birding application with a React frontend for bird identification. The application allows users to upload bird photos for identification and aims to build a personal bird collection tracking system.

## Architecture

- **Frontend**: React 19.1.0 application bootstrapped with Create React App
- **Main Components**:
  - `App.js`: Root component that renders the LandingPage
  - `LandingPage.js`: Core component handling image upload, drag/drop, and bird identification UI
- **Styling**: Component-specific CSS files (App.css, LandingPage.css)
- **Testing**: React Testing Library with Jest

## Common Development Commands

### Frontend (bird-game-frontend/)
```bash
# Start development server (runs on http://localhost:3000)
npm start

# Run tests in watch mode
npm test

# Build for production
npm run build

# Lint and type checking
# Note: Uses built-in ESLint config from react-scripts
```

### Backend (bird-game-backend/)
```bash
# Start backend server (runs on http://127.0.0.1:3001)
npm start

# Start with development monitoring
npm run dev

# Test backend health endpoint
curl -X GET http://127.0.0.1:3001/api/health
```

## Key Features

The application currently implements:
- **Frontend**: Image upload via file selection and drag/drop
- **Frontend**: Image preview with validation (JPG, PNG, GIF up to 10MB)
- **Backend**: Express.js server with bird identification API
- **Backend**: Mock bird identification with random responses
- **Integration**: Frontend-backend communication via fetch API
- **UI**: Responsive design with feature showcases

## Development Notes

- **Backend**: Node.js/Express server with multer for image uploads
- **API**: Mock bird identification service with fallback to real APIs
- **Frontend**: React hooks (useState) for state management
- **Image handling**: Proper cleanup with URL.revokeObjectURL
- **CORS**: Configured for localhost:3000 to localhost:3001 communication
- **Dependencies**: Express 4.x for stability (avoid Express 5.x)