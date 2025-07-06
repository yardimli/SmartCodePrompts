# Smart Code Prompts

**Smart Code Prompts** is a self-hosted Electron application for interactively constructing and analyzing code prompts for Large Language Models (LLMs). Its primary use case is to help developers generate structured file overviews to send to any LLM for code completion, refactoring, documentation generation, etc.

The tool provides a visual interface to select code projects, browse files, and trigger LLM-based analyses, all configurable and saved via a local SQLite database.

---

## Features

- **Project Selection:** Point to one or multiple local root directories as project sources
- **File Tree Explorer:** View your codebase as a dynamic, filterable file tree
- **Bulk File Selection:** Select multiple files for prompt analysis, either manually or via search
- **Prompt Construction:** Preview and copy auto-generated, minified code content for selected files
- **LLM Integration:** Analyze code using OpenRouter.ai models with file-specific analysis caching
- **LLM/Prompt Management:** Configure prompt templates for file overviews and function summaries
- **State Persistence:** Remembers last opened projects, folders, and file selections
- **Dark Mode:** Toggle between light/dark theme with persistent setting
- **Setup UI:** Easy configuration for directories, file extensions, API key, and prompt templates

---

## Installation

**Requirements:**
- Node.js v16+ (with npm)
- OpenRouter.ai account & API Key (for LLM analysis features)

**Steps:**

```bash
git clone https://github.com/yardimli/SmartCodePrompts.git
cd SmartCodePrompts

npm install
npm start
```

The Electron app will launch automatically after building.

---

## Usage

1. **Go to Settings** (gear icon) and:
   - Enter directories for your projects
   - Enter your OpenRouter API key
   - Adjust prompt templates if needed
   - Select a project from the dropdown
   - Browse and select files to include
   - Use search, analysis, and prompt features as needed
   - Select an LLM and click the analysis button to analyze files
   - Click info icons to view previously saved analyses per file

---

## OpenRouter/LLM Integration

**LLM Analysis** requires a valid OpenRouter API key and internet connection. Supported models are dynamically fetched and listed in the LLM dropdown.

- [OpenRouter.ai documentation](https://openrouter.ai/docs)

---

## Security

- All filesystem access is restricted to your configured roots
- API keys and state data are stored in your local SQLite database
- No external network file access unless you use the LLM analysis feature.

---

## License

ISC / MIT — Locutus of Borg

---

## Credits

- UI: [Tailwind CSS](https://tailwindcss.com/), [DaisyUI](https://daisyui.com/), [Bootstrap Icons](https://icons.getbootstrap.com/)
- Database: [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- Framework: [Electron](https://www.electronjs.org/)

---

## Contributing

Pull requests welcome! Please file issues or feature requests for bugs or enhancements.

---

**Happy Prompting!** 🚀
