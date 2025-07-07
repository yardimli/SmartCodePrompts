// SmartCodePrompts/js/llm.js

// Import required functions from utils.js.
import {show_loading, hide_loading, post_data} from './utils.js';
import {show_alert} from './modal-alert.js';

/**
 * Populates a single LLM dropdown with a list of models.
 * @param {string} dropdown_id - The ID of the dropdown element to populate.
 * @param {Array} llms - An array of LLM objects, each with an 'id' and 'name'.
 * @param {string} selected_llm_id - The ID of the LLM to pre-select.
 */
function populate_llm_dropdown(dropdown_id, llms, selected_llm_id) {
	const dropdown = document.getElementById(dropdown_id);
	if (!dropdown) return; // Safety check
	dropdown.innerHTML = '';
	
	if (!llms || llms.length === 0) {
		dropdown.innerHTML = '<option value="">No LLMs found</option>';
		return;
	}
	
	const default_option = document.createElement('option');
	default_option.value = '';
	default_option.textContent = 'Select an LLM...';
	default_option.disabled = true;
	dropdown.appendChild(default_option);
	
	llms.forEach(llm => {
		const option = document.createElement('option');
		option.value = llm.id;
		option.textContent = llm.name;
		dropdown.appendChild(option);
	});
	
	// Set the selected value if it exists in the new list.
	if (selected_llm_id && dropdown.querySelector(`option[value="${selected_llm_id}"]`)) {
		dropdown.value = selected_llm_id;
	} else {
		dropdown.value = '';
	}
}

/**
 * Initializes all four LLM selector components.
 * @param {Array} llms - The initial list of LLMs from the server.
 * @param {object} last_selected_llms - An object containing the last used LLM for each function.
 */
export function initialize_llm_selector(llms, last_selected_llms) {
	populate_llm_dropdown('llm-dropdown-analysis', llms, last_selected_llms.analysis);
	populate_llm_dropdown('llm-dropdown-smart-prompt', llms, last_selected_llms.smart_prompt);
	populate_llm_dropdown('llm-dropdown-qa', llms, last_selected_llms.qa);
	populate_llm_dropdown('llm-dropdown-direct-prompt', llms, last_selected_llms.direct_prompt);
};

/**
 * Sets up event listeners for the LLM dropdowns and refresh button.
 */
export function setup_llm_listeners() {
	const llm_dropdown_configs = [
		{id: 'llm-dropdown-analysis', key: 'last_selected_llm_analysis'},
		{id: 'llm-dropdown-smart-prompt', key: 'last_selected_llm_smart_prompt'},
		{id: 'llm-dropdown-qa', key: 'last_selected_llm_qa'},
		{id: 'llm-dropdown-direct-prompt', key: 'last_selected_llm_direct_prompt'}
	];
	
	// Save the selected LLM to the server when the user changes any dropdown.
	llm_dropdown_configs.forEach(config => {
		const dropdown = document.getElementById(config.id);
		if (dropdown) {
			dropdown.addEventListener('change', function () {
				const selected_llm_id = this.value;
				if (selected_llm_id) {
					post_data({action: 'save_selected_llm', key: config.key, llm_id: selected_llm_id})
						.catch(err => console.error(`Failed to save selected LLM for ${config.key}:`, err));
				}
			});
		}
	});
	
	document.getElementById('refresh-llms').addEventListener('click', async function () {
		const refresh_button = this;
		const icon = refresh_button.querySelector('i');
		
		// Store current selections to re-apply them after refresh
		const current_selections = {};
		llm_dropdown_configs.forEach(config => {
			const dropdown = document.getElementById(config.id);
			if (dropdown) {
				current_selections[config.id] = dropdown.value;
			}
		});
		
		refresh_button.disabled = true;
		show_loading('Refreshing LLMs...');
		
		try {
			const response = await post_data({action: 'refresh_llms'});
			if (response.success) {
				// Repopulate all dropdowns with the new list, preserving selections
				llm_dropdown_configs.forEach(config => {
					populate_llm_dropdown(config.id, response.llms, current_selections[config.id]);
				});
				show_alert('LLM list updated successfully.');
			} else {
				throw new Error(response.error || 'Unknown error during refresh.');
			}
		} catch (error) {
			console.error('Failed to refresh LLM list:', error);
			show_alert(`Error refreshing LLMs: ${error.message}`, 'Error');
		} finally {
			refresh_button.disabled = false;
			hide_loading();
		}
	});
}
