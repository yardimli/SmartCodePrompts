// SmartCodePrompts/js/llm.js

// Import required functions from utils.js.
import {show_loading, hide_loading, post_data} from './utils.js';

/**
 * Populates the LLM dropdown with a list of models.
 * This is now an internal function to this module.
 * @param {Array} llms - An array of LLM objects, each with an 'id' and 'name'.
 * @param {string} selected_llm_id - The ID of the LLM to pre-select.
 */
function populate_llm_dropdown(llms, selected_llm_id) {
	const dropdown = document.getElementById('llm-dropdown');
	dropdown.innerHTML = '';
	
	if (!llms || llms.length === 0) {
		dropdown.innerHTML = '<option value="">No LLMs found</option>';
		// Attempt to fetch models if the list is empty on load.
		document.getElementById('refresh-llms').click();
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
 * Initializes the LLM selector component. This is now an exported function.
 * @param {Array} llms - The initial list of LLMs from the server.
 * @param {string} last_selected_llm - The ID of the last used LLM.
 */
export function initialize_llm_selector(llms, last_selected_llm) {
	populate_llm_dropdown(llms, last_selected_llm);
};

/**
 * Sets up event listeners for the LLM dropdown and refresh button.
 * This function is called from main.js to keep all listener setups in one place.
 */
export function setup_llm_listeners() {
	// Save the selected LLM to the server when the user changes the dropdown.
	document.getElementById('llm-dropdown').addEventListener('change', function () {
		const selected_llm_id = this.value;
		if (selected_llm_id) {
			post_data({action: 'save_selected_llm', llm_id: selected_llm_id})
				.catch(err => console.error('Failed to save selected LLM:', err));
		}
	});
	
	document.getElementById('refresh-llms').addEventListener('click', async function () {
		const refresh_button = this;
		const icon = refresh_button.querySelector('i');
		const current_selected_id = document.getElementById('llm-dropdown').value;
		
		icon.classList.add('fa-spin');
		refresh_button.disabled = true;
		show_loading('Refreshing LLMs...');
		
		try {
			const response = await post_data({action: 'refresh_llms'});
			if (response.success) {
				populate_llm_dropdown(response.llms, current_selected_id);
				alert('LLM list updated successfully.');
			} else {
				throw new Error(response.error || 'Unknown error during refresh.');
			}
		} catch (error) {
			console.error('Failed to refresh LLM list:', error);
			alert(`Error refreshing LLMs: ${error.message}`);
		} finally {
			icon.classList.remove('fa-spin');
			refresh_button.disabled = false;
			hide_loading();
		}
	});
}
