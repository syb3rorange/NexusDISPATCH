
# 🚨 Nexus Dispatch CAD - Deployment Guide

This application is designed to be hosted for **free** on GitHub Pages. Follow these steps to get your shareable URL.

## 🚀 Easy Hosting with GitHub Pages

1. **Create a GitHub Repository**: 
   - Go to [GitHub](https://github.com) and create a new repository named `nexus-cad`.
2. **Upload Your Files**:
   - Upload all the files from this project (`index.html`, `App.tsx`, `package.json`, etc.) into that repository.
3. **Enable GitHub Pages**:
   - Go to the **Settings** tab of your repository.
   - Click on **Pages** in the left sidebar.
   - Under "Build and deployment", set the source to **GitHub Actions**.
4. **The URL**:
   - GitHub will generate a link like `https://yourusername.github.io/nexus-cad/`. 
   - **Important**: Your app uses "Hash Routing" (the `#` in the URL), which is perfectly compatible with GitHub's free hosting.

## 🤝 How to Sync
- Once the site is live, open the link.
- Your browser will automatically add a unique Room ID (e.g., `#abc123xyz`).
- Share the **full URL** with your team to join the same private network room.
- Because we use **Gun.js**, your data will sync between your computers without needing a paid server!

## 🤖 AI Features (Important)
Since GitHub Pages is a public static host, it cannot "hide" secret keys. To keep the AI features working safely for you and your team:
- The app expects an `API_KEY` for the Gemini AI features.
- If you are using a professional deployment tool like Vercel, add the key in the "Environment Variables" section.
- If using GitHub Actions, you can inject it during the build process as a secret.

## 🔑 Access Codes
- **Dispatch Terminal**: `10-4`
- **Unit Login**: No password required, just a Roblox username and Callsign.
