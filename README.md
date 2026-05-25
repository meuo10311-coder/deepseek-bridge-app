# DeepSeek Bridge APK

This project builds a small Android WebView app that opens https://chat.deepseek.com and injects app/src/main/assets/bridge.js.

The injected bridge talks to the local Termux server at http://127.0.0.1:8790 through the native JavaScript interface TermuxAgentBridge, avoiding browser CORS and mixed-content issues.

## Build on GitHub

1. Create a new GitHub repository.
2. Upload the contents of this deepseek-bridge-app directory as the repository root.
3. Open the Actions tab.
4. Run "Build DeepSeek Bridge APK" manually, or push to main/master.
5. Download the artifact named deepseek-bridge-apk.
6. Install app-debug.apk on the Android phone.

## Run on the phone

1. Start the local agent server from ~/agent-lab:

   node server.js

2. Open the installed DeepSeek Bridge app.
3. Log in to DeepSeek once if needed.
4. The app will poll:

   GET http://127.0.0.1:8790/bridge/next-task

   and submit responses to:

   POST http://127.0.0.1:8790/bridge/submit-response

## Architecture

- DeepSeek WebView: reasoning brain.
- bridge.js: DOM sender/reader inside DeepSeek.
- TermuxAgentBridge: native Android HTTP bridge to localhost.
- Termux server.js: job queue and Shizuku tool executor.
