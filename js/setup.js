// llm-php-helper/js/setup.js
// MODIFIED: Converted to an ES6 module.
import {postData} from './utils.js';

// --- DOM Element References ---
const form = document.getElementById('setup-form');
const loadingIndicator = document.getElementById('loading-indicator');
const rootDirsInput = document.getElementById('root-directories-input');
const allowedExtsInput = document.getElementById('allowed-extensions-input');
const excludedFoldersInput = document.getElementById('excluded-folders-input');
const serverPortInput = document.getElementById('server-port-input');
const openRouterApiKeyInput = document.getElementById('openrouter-api-key-input');
const promptFileOverviewInput = document.getElementById('prompt-file-overview-input');
const promptFunctionsLogicInput = document.getElementById('prompt-functions-logic-input');
const promptContentFooterInput = document.getElementById('prompt-content-footer-input');
const resetPromptsBtn = document.getElementById('reset-prompts-btn');
const toggleModeBtn = document.getElementById('toggle-mode');

/**
 * Applies dark mode styling based on the provided boolean.
 * @param {boolean} isDarkMode - Whether dark mode should be enabled.
 */
function applyDarkMode(isDarkMode) {
	const toggleIcon = toggleModeBtn.querySelector('i');
	if (isDarkMode) {
		document.body.classList.add('dark-mode');
		if (toggleIcon) toggleIcon.classList.replace('fa-sun', 'fa-moon');
	} else {
		document.body.classList.remove('dark-mode');
		if (toggleIcon) toggleIcon.classList.replace('fa-moon', 'fa-sun');
	}
}

/**
 * Loads configuration data from the server and populates the form.
 */
async function loadSetupData() {
	try {
		const data = await postData({action: 'get_setup'});
		const config = data.config;
		
		// Populate form fields
		rootDirsInput.value = (config.root_directories || []).join('\n');
		allowedExtsInput.value = (config.allowed_extensions || []).join(', ');
		excludedFoldersInput.value = (config.excluded_folders || []).join(', ');
		serverPortInput.value = config.server_port || 3000;
		openRouterApiKeyInput.value = config.openrouter_api_key || '';
		promptFileOverviewInput.value = config.prompt_file_overview || '';
		promptFunctionsLogicInput.value = config.prompt_functions_logic || '';
		promptContentFooterInput.value = config.prompt_content_footer || '';
		
		// Apply dark mode from main settings
		applyDarkMode(data.darkMode);
		
		// Show form and hide spinner
		loadingIndicator.style.display = 'none';
		form.style.display = 'block';
	} catch (error) {
		loadingIndicator.innerHTML = `<p class="text-center text-danger">Error loading setup data: ${error.message}</p>`;
	}
}

// --- Event Listeners ---

toggleModeBtn.addEventListener('click', () => {
	const isDarkMode = document.body.classList.toggle('dark-mode');
	applyDarkMode(isDarkMode);
	postData({action: 'set_dark_mode', isDarkMode: isDarkMode})
		.catch(err => console.error("Failed to save dark mode setting.", err));
});

form.addEventListener('submit', async (e) => {
	e.preventDefault();
	try {
		const saveData = {
			action: 'save_setup',
			root_directories: JSON.stringify(rootDirsInput.value.split('\n').map(s => s.trim()).filter(Boolean)),
			allowed_extensions: JSON.stringify(allowedExtsInput.value.split(',').map(s => s.trim()).filter(Boolean)),
			excluded_folders: JSON.stringify(excludedFoldersInput.value.split(',').map(s => s.trim()).filter(Boolean)),
			server_port: serverPortInput.value,
			openrouter_api_key: openRouterApiKeyInput.value.trim(),
			prompt_file_overview: promptFileOverviewInput.value,
			prompt_functions_logic: promptFunctionsLogicInput.value,
			prompt_content_footer: promptContentFooterInput.value
		};
		await postData(saveData);
		alert('Configuration saved successfully!\n\nPlease restart the server for port changes to take effect.');
	} catch (error) {
		alert(`Failed to save configuration: ${error.message}`);
	}
});

resetPromptsBtn.addEventListener('click', async () => {
	if (confirm('Are you sure you want to reset all prompts to their default values? This cannot be undone.')) {
		try {
			await postData({action: 'reset_prompts'});
			alert('Prompts have been reset to their default values.');
			// Reload the form to show the new default values
			await loadSetupData();
		} catch (error) {
			alert(`Failed to reset prompts: ${error.message}`);
		}
	}
});

// --- Initial Load ---
loadSetupData();
