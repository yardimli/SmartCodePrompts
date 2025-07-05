// SmartCodePrompts/js/setup.js
import {post_data} from './utils.js';

// --- DOM Element References ---
const form = document.getElementById('setup-form');
const loading_indicator = document.getElementById('loading-indicator');
// MODIFIED: Removed root-directories-input
const allowed_exts_input = document.getElementById('allowed-extensions-input');
const excluded_folders_input = document.getElementById('excluded-folders-input');
const server_port_input = document.getElementById('server-port-input');
const open_router_api_key_input = document.getElementById('openrouter-api-key-input');
const prompt_file_overview_input = document.getElementById('prompt-file-overview-input');
const prompt_functions_logic_input = document.getElementById('prompt-functions-logic-input');
const prompt_content_footer_input = document.getElementById('prompt-content-footer-input');
const prompt_smart_prompt_input = document.getElementById('prompt-smart-prompt-input');
const reset_prompts_btn = document.getElementById('reset-prompts-btn');
const toggle_mode_btn = document.getElementById('toggle-mode');


function apply_dark_mode(is_dark_mode) {
	const toggle_icon = toggle_mode_btn.querySelector('i');
	if (is_dark_mode) {
		document.documentElement.setAttribute('data-theme', 'dark');
		if (toggle_icon) toggle_icon.classList.replace('bi-sun', 'bi-moon');
	} else {
		document.documentElement.setAttribute('data-theme', 'light');
		if (toggle_icon) toggle_icon.classList.replace('bi-moon', 'bi-sun');
	}
}

/**
 * Loads configuration data from the server and populates the form.
 */
async function load_setup_data() {
	try {
		const data = await post_data({action: 'get_setup'});
		const config = data.config;
		
		// Populate form fields
		// MODIFIED: Removed root_directories population
		allowed_exts_input.value = (config.allowed_extensions || []).join(', ');
		excluded_folders_input.value = (config.excluded_folders || []).join(', ');
		server_port_input.value = config.server_port || 3000;
		open_router_api_key_input.value = config.openrouter_api_key || '';
		prompt_file_overview_input.value = config.prompt_file_overview || '';
		prompt_functions_logic_input.value = config.prompt_functions_logic || '';
		prompt_content_footer_input.value = config.prompt_content_footer || '';
		prompt_smart_prompt_input.value = config.prompt_smart_prompt || '';
		
		apply_dark_mode(data.dark_mode);
		
		loading_indicator.style.display = 'none';
		form.style.display = 'block';
	} catch (error) {
		loading_indicator.innerHTML = `<p class="text-center text-error">Error loading setup data: ${error.message}</p>`;
	}
}

// --- Event Listeners ---
toggle_mode_btn.addEventListener('click', () => {
	const is_dark_mode = document.documentElement.getAttribute('data-theme') === 'dark';
	const new_theme = is_dark_mode ? 'light' : 'dark';
	apply_dark_mode(!is_dark_mode);
	post_data({action: 'set_dark_mode', is_dark_mode: !is_dark_mode})
		.catch(err => console.error("Failed to save dark mode setting.", err));
});

form.addEventListener('submit', async (e) => {
	e.preventDefault();
	try {
		const save_data = {
			action: 'save_setup',
			// MODIFIED: Removed root_directories from save data
			allowed_extensions: JSON.stringify(allowed_exts_input.value.split(',').map(s => s.trim()).filter(Boolean)),
			excluded_folders: JSON.stringify(excluded_folders_input.value.split(',').map(s => s.trim()).filter(Boolean)),
			server_port: server_port_input.value,
			openrouter_api_key: open_router_api_key_input.value.trim(),
			prompt_file_overview: prompt_file_overview_input.value,
			prompt_functions_logic: prompt_functions_logic_input.value,
			prompt_content_footer: prompt_content_footer_input.value,
			prompt_smart_prompt: prompt_smart_prompt_input.value
		};
		await post_data(save_data);
		alert('Configuration saved successfully!\n\nPlease restart the server for port changes to take effect.');
	} catch (error) {
		alert(`Failed to save configuration: ${error.message}`);
	}
});

reset_prompts_btn.addEventListener('click', async () => {
	if (confirm('Are you sure you want to reset all prompts to their default values? This cannot be undone.')) {
		try {
			await post_data({action: 'reset_prompts'});
			alert('Prompts have been reset to their default values.');
			await load_setup_data();
		} catch (error) {
			alert(`Failed to reset prompts: ${error.message}`);
		}
	}
});

// --- Initial Load ---
load_setup_data();
