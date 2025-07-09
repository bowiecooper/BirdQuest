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

All commands should be run from the `bird-game-frontend/` directory:

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

## Key Features

The application currently implements:
- Image upload via file selection and drag/drop
- Image preview with validation (JPG, PNG, GIF up to 10MB)
- Placeholder bird identification workflow (TODO: backend integration)
- Responsive UI with feature showcases

## Development Notes

- The bird identification feature is stubbed out with a setTimeout simulation
- Backend API integration is marked as TODO in `LandingPage.js:34`
- Uses React hooks (useState) for state management
- Image handling includes proper cleanup with URL.revokeObjectURL