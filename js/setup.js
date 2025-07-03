// llm-php-helper/setup.js
document.addEventListener('DOMContentLoaded', function () {
	// --- Helper Functions ---
	async function postData(url, data) {
		const formData = new URLSearchParams();
		for (const key in data) {
			formData.append(key, data[key]);
		}
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: formData
			});
			if (!response.ok) {
				const errorPayload = await response.json();
				throw new Error(errorPayload.error || `HTTP error! status: ${response.status}`);
			}
			return await response.json();
		} catch (error) {
			console.error('Fetch Error:', error);
			throw error;
		}
	}
	
	// --- Dark Mode ---
	function applyDarkMode(isDarkMode) {
		const toggleIcon = document.querySelector('#toggle-mode i');
		if (isDarkMode) {
			document.body.classList.add('dark-mode');
			if (toggleIcon) toggleIcon.classList.replace('fa-sun', 'fa-moon');
		} else {
			document.body.classList.remove('dark-mode');
			if (toggleIcon) toggleIcon.classList.replace('fa-moon', 'fa-sun');
		}
	}
	
	document.getElementById('toggle-mode').addEventListener('click', function () {
		const isDarkMode = document.body.classList.toggle('dark-mode');
		applyDarkMode(isDarkMode);
		postData('/', {
			action: 'set_dark_mode',
			isDarkMode: isDarkMode
		})
			.catch(err => console.error("Failed to save dark mode setting.", err));
	});
	
	// --- Setup Form Logic ---
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
	
	async function loadSetupData() {
		try {
			const data = await postData('/', {
				action: 'get_setup'
			});
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
	
	form.addEventListener('submit', async function (e) {
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
			
			await postData('/', saveData);
			alert('Configuration saved successfully!\n\nPlease restart the server for port changes to take effect.');
		} catch (error) {
			alert(`Failed to save configuration: ${error.message}`);
		}
	});
	
	resetPromptsBtn.addEventListener('click', async () => {
		if (confirm('Are you sure you want to reset all prompts to their default values? This cannot be undone.')) {
			try {
				await postData('/', {
					action: 'reset_prompts'
				});
				alert('Prompts have been reset to their default values.');
				// Reload the form to show the new default values
				await loadSetupData();
			} catch (error) {
				alert(`Failed to reset prompts: ${error.message}`);
			}
		}
	});
	
	// Initial load
	loadSetupData();
});
