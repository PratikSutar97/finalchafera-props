# फायनल चा फेरा — Props Checklist (React + Vite)

This is a React/Vite recreation of the supplied props checklist. It keeps the existing Firestore collections and document shape:
- `dramaProps/{actN_praveshN}` — `title` and `items` map
- `dramaPropsMeta/main` — `lastUpdatedAt`
- `dramaPropsTrash/{trashId}` — deleted props for restore

## 1. Requirements
- Node.js 18+ (Node 20 LTS recommended)
- Access to the Firebase project and its Firestore database

## 2. Setup
```bash
npm install
```
Copy `.env.example` to `.env.local`, then fill in the Firebase Web App config values:
```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```
The `.env.example` file is prefilled with the Firebase Web App config from your original HTML. Copy it to `.env.local`. If your Firebase config has changed, update those values from Firebase Console → Project settings → Your apps.

## 3. Run locally
```bash
npm run dev
```
Open the local URL printed by Vite.

## 4. Production build
```bash
npm run build
npm run preview
```

## PDF download fix
The PDF export was rewritten to:
- build a dedicated export document from the latest Firestore snapshot, including every act and entry (not just the currently visible tab or search results);
- append it to the document before capture and wait for browser layout/fonts;
- validate that the rendered source contains content and that the generated PDF has pages and a non-trivial Blob size;
- download the actual generated Blob and always clean up the temporary export node;
- use `html2pdf.js` as an npm dependency rather than relying on a global CDN script.

If Marathi/Devanagari text appears incorrectly in PDF on a particular device, ensure Noto Sans Devanagari is available/network-loaded before exporting. The export waits for `document.fonts.ready`.

## Important
- This app reads and writes the existing Firestore database; it does not seed or overwrite data.
- Firestore Security Rules must permit the required reads/writes for your intended users. Do not loosen production rules just to make the UI work.
- A Firebase web API key is not a server secret, but access should still be controlled by Firebase Security Rules and (where appropriate) App Check.
