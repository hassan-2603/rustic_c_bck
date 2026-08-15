# Rustic Charm - Backend Service 🍳⚙️

This directory contains the entire isolated backend service for the **Rustic Charm** restaurant system.

---

## 🛠 Features & Capabilities

- **Express REST API Server**: Node.js + Express API endpoints running on `http://localhost:5000`.
- **Firebase Admin SDK Integration**: Secure server-side Firestore operations using `serviceAccountKey.json`.
- **Gemini AI Translation Endpoint**: Batch menu translation into 7 languages using Google GenAI (`@google/genai`).
- **PDF Menu Parser Script**: Automatically extracts menu items and prices from `menu.pdf` using `pdfreader`.
- **Firebase Cloud Functions**: Serverless HTTPS trigger functions setup in `functions/`.

---

## 📁 Directory Structure

```
backend/
├── server.js               # Main Express REST API Server
├── package.json            # Backend Node.js Dependencies & Scripts
├── serviceAccountKey.json  # Firebase Admin Service Account Key
├── parse-menu.cjs          # PDF Menu Parser Script
├── menu.pdf                # Restaurant PDF Menu source file
├── .env                    # Environment variables (GEMINI_API_KEY, PORT, etc.)
├── firebase.json           # Firebase Functions deploy config
├── .firebaserc             # Firebase Project config
├── functions/              # Firebase Cloud Functions source code
└── README.md               # Backend documentation
```

---

## 🚀 Quick Start Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Run API Server (Development Mode)
```bash
npm run dev
```
The server will start at `http://localhost:5000`.

### 3. Run Menu PDF Parser
```bash
npm run parse-menu
```

### 4. Run Firebase Functions Emulator
```bash
npm run fb:serve
```

---

## 📡 API Endpoints Summary

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Check backend server & Firebase status |
| `GET` | `/api/menu` | Retrieve menu items from Firestore |
| `POST` | `/api/menu` | Add a new menu item |
| `DELETE` | `/api/menu/:id` | Remove a menu item |
| `GET` | `/api/categories` | Retrieve menu categories |
| `GET` | `/api/orders` | Retrieve all restaurant orders |
| `POST` | `/api/orders` | Create a new table order |
| `POST` | `/api/translate-menu` | AI translation endpoint using Gemini |

---

## 🔑 Environment Variables (`.env`)

- `PORT`: Server port (default `5000`)
- `GEMINI_API_KEY`: API key for Google Gemini AI translation
- `APP_URL`: Base application URL
