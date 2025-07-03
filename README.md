# Smart Code Prompts

**Smart Code Prompts** is a self-hosted Node.js application for interactively constructing and analyzing code prompts for Large Language Models (LLMs). Its primary use case is to help developers (especially for PHP, JavaScript, HTML, etc.) generate structured file overviews, to send to any LLM to get code completion, refactoring, documentation generation, etc.

The tool provides a visual interface to select code projects, browse files, and trigger LLM-based analyses, all configurable and saved via a local SQLite database.

---

## Features

- **Project Selection:** Point to one or multiple local root directories as project sources.
- **File Tree Explorer:** View your codebase as a dynamic, filterable file tree, respecting allowed file extensions and excluding specified folders.
- **Bulk File Selection:** Select multiple files for prompt analysis, either manually or via search.
- **Prompt Construction:** Preview and copy auto-generated, minified code content for selected files with custom user prompts.
- **LLM Integration:** Analyze code using OpenRouter.ai models, saving responses as clickable file-specific analyses.
- **LLM/Prompt Management:** Configure prompt templates for file overviews, function summaries, and multi-file content.
- **State Persistence:** Remembers last opened projects, folders, and file selections.
- **Dark Mode:** Toggle between light/dark theme with persistent setting.
- **Setup UI:** Easy UI for changing server settings, allowed file extensions, OpenRouter API key, and prompt templates.

---

## Installation

**Requirements:**
- Node.js v16+ (with npm)
- SQLite3 (managed via `better-sqlite3` NPM package)
- OpenRouter.ai account & API Key (for LLM analysis features)

**Steps:**

```bash
git clone https://github.com/yardimli/SmartCodePrompts.git
cd SmartCodePrompts

npm install
# Edit (or use the UI to set) your root directories and OpenRouter API key

node node-server.js
```

---

## Usage

1. **Open** [http://localhost:3000](http://localhost:3000) in your browser.
2. **Go to 'Configure'** (gear icon/Setup page) and:
    - Enter directories for your projects.
    - Add file extensions/types to include.
    - Enter your OpenRouter API key.
    - Adjust prompt templates if needed.
3. **Go to 'Select Projects':**
    - Choose which project folders you want to make available in the app.
4. **Return to main page** and:
    - Select a project (dropdown).
    - Browse files and select those you want to include.
    - Use search, analysis, and prompt features as needed.
    - Select an LLM and click the analysis button to analyze files (requires OpenRouter API key).
    - Click info icons to view previously saved analyses per file.

---

## Customization

- Use the **Setup page** to set your root directories, allowed/excluded file/folder patterns, prompts, API key, and more.
- Prompts for "File Overview" and "Functions & Logic" are customizable and accept placeholders:
    - `${filePath}`: Will be replaced by the file’s relative path.
    - `${fileContent}`: Will be replaced by the file’s minified code content.

---

## Project Structure
```
SmartCodePrompts/
│
├─ node-server.js        # Main server entrypoint; routes requests, serves static files
├─ node-config.js        # Handles database setup, loading/saving app settings
├─ node-files.js         # Secure file/folder access, file tree, and searching
├─ node-llm.js           # LLM API interaction, model refresh, code analysis, caching
├─ node-projects.js      # Project selection logic (scan, add, remove)
│
├─ js/                   # Client-side JS modules (ES6, modular)
├─ css/                  # Stylesheets
├─ index.html            # Main app UI
├─ projects.html         # Project selection UI
├─ setup.html            # Initial configuration/setup UI
├─ package.json
├─ llm-helper.sqlite     # Local SQLite3 DB for all app state
└─ README.md             # This file
```

---

## OpenRouter/LLM Integration

**LLM Analysis** requires a valid OpenRouter API key and an internet connection. Supported models are dynamically fetched and listed in the LLM dropdown.

- [OpenRouter.ai documentation](https://openrouter.ai/docs)

---

## Troubleshooting

- **Port in use**: Change the server port in the Setup UI, then *restart* the server.
- **Error: "No LLMs found"**: Use the refresh icon near the LLM dropdown; ensure internet access and a valid API key.
- **"Skipped (up-to-date)"**: Analysis is skipped if the file content checksum hasn't changed since the last analysis.
- **Permissions**: Ensure that the Node.js process has read access to your selected root directories.
- **No Projects Detected**: Check your "Root Directories" and file/folder patterns on the Setup page. Folders matching "excluded folders" will not be loaded.

---

## Security

- All filesystem access is restricted to your configured roots; no external network file access.
- All API keys and state data are stored in your local SQLite database.

---

## License

ISC / MIT — Locutus of Borg

---

## Credits

- Uses [Bootstrap 5](https://getbootstrap.com/) and [FontAwesome](https://fontawesome.com/) for UI.
- SQLite3 database via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3).

---

## Contributing

Pull requests welcome! Please file issues or feature requests for bugs or enhancements.

---

## Roadmap / TODO

- [ ] Auto select files using the analysis results with modal for entering prompt.
- [ ] Improved error handling for when LLM outputs is poor.
- [ ] Auto apply LLM output to files.
- [ ] Add support for other LLM providers (Ollama, local models, etc.).
- [ ] Improved error handling for prompt analysis failures.
- [ ] User authentication for multi-user environments.

---

**Happy Prompting!** 🚀
