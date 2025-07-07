// SmartCodePrompts/js/modal-setup.js
import {show_loading, hide_loading, post_data} from './utils.js';
import {show_alert} from './modal-alert.js'; // NEW: Import custom alert modal

let setup_modal = null;

/**
 * Initializes the setup modal element reference.
 */
export function initialize_setup_modal () {
	setup_modal = document.getElementById('setup_modal');
};

/**
 * Loads configuration data from the server and populates the setup form in the modal.
 */
async function load_setup_data () {
	const form = document.getElementById('setup-form');
	const loading_indicator = document.getElementById('setup-loading-indicator');
	
	loading_indicator.style.display = 'block';
	form.style.display = 'none';
	
	try {
		const data = await post_data({action: 'get_setup'});
		const config = data.config;
		
		document.getElementById('allowed-extensions-input').value = (config.allowed_extensions || []).join(', ');
		document.getElementById('excluded-folders-input').value = (config.excluded_folders || []).join(', ');
		document.getElementById('openrouter-api-key-input').value = config.openrouter_api_key || '';
		document.getElementById('prompt-file-overview-input').value = config.prompt_file_overview || '';
		document.getElementById('prompt-functions-logic-input').value = config.prompt_functions_logic || '';
		document.getElementById('prompt-content-footer-input').value = config.prompt_content_footer || '';
		document.getElementById('prompt-smart-prompt-input').value = config.prompt_smart_prompt || '';
		
		loading_indicator.style.display = 'none';
		form.style.display = 'block';
	} catch (error) {
		loading_indicator.innerHTML = `<p class="text-center text-error">Error loading setup data: ${error.message}</p>`;
	}
}

/**
 * Opens the setup modal and loads the current configuration.
 */
export function open_setup_modal () {
	if (setup_modal) {
		setup_modal.showModal();
		load_setup_data();
	}
};

/**
 * Sets up event listeners for the setup modal controls.
 */
export function setup_setup_modal_listeners () {
	document.getElementById('setup-modal-button').addEventListener('click', open_setup_modal);
	
	document.getElementById('save-setup-button').addEventListener('click', async () => {
		const save_button = document.getElementById('save-setup-button');
		const original_text = save_button.textContent;
		save_button.disabled = true;
		save_button.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Saving...';
		
		try {
			const save_data = {
				action: 'save_setup',
				allowed_extensions: JSON.stringify(document.getElementById('allowed-extensions-input').value.split(',').map(s => s.trim()).filter(Boolean)),
				excluded_folders: JSON.stringify(document.getElementById('excluded-folders-input').value.split(',').map(s => s.trim()).filter(Boolean)),
				openrouter_api_key: document.getElementById('openrouter-api-key-input').value.trim(),
				prompt_file_overview: document.getElementById('prompt-file-overview-input').value,
				prompt_functions_logic: document.getElementById('prompt-functions-logic-input').value,
				prompt_content_footer: document.getElementById('prompt-content-footer-input').value,
				prompt_smart_prompt: document.getElementById('prompt-smart-prompt-input').value
			};
			await post_data(save_data);
			show_alert('Configuration saved successfully!\n\nApplication will now reload.'); // MODIFIED: Use custom alert
			window.location.reload();
		} catch (error) {
			show_alert(`Failed to save configuration: ${error.message}`, 'Error'); // MODIFIED: Use custom alert
			save_button.disabled = false;
			save_button.innerHTML = original_text;
		}
	});
	
	document.getElementById('reset-prompts-btn').addEventListener('click', async () => {
		if (confirm('Are you sure you want to reset all prompts to their default values? This cannot be undone.')) {
			try {
				show_loading('Resetting prompts...');
				await post_data({action: 'reset_prompts'});
				await load_setup_data(); // Reload data in the modal
				hide_loading();
				show_alert('Prompts have been reset to their default values.'); // MODIFIED: Use custom alert
			} catch (error) {
				hide_loading();
				show_alert(`Failed to reset prompts: ${error.message}`, 'Error'); // MODIFIED: Use custom alert
			}
		}
	});
};
