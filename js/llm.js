// SmartCodePrompts/js/llm.js

// Import required functions from utils.js.
import {showLoading, hideLoading, postData} from './utils.js';

/**
 * Populates the LLM dropdown with a list of models.
 * This is now an internal function to this module.
 * @param {Array} llms - An array of LLM objects, each with an 'id' and 'name'.
 * @param {string} selectedLlmId - The ID of the LLM to pre-select.
 */
function populateLlmDropdown(llms, selectedLlmId) {
	const dropdown = document.getElementById('llm-dropdown');
	dropdown.innerHTML = '';
	
	if (!llms || llms.length === 0) {
		dropdown.innerHTML = '<option value="">No LLMs found</option>';
		// Attempt to fetch models if the list is empty on load.
		document.getElementById('refresh-llms').click();
		return;
	}
	
	const defaultOption = document.createElement('option');
	defaultOption.value = '';
	defaultOption.textContent = 'Select an LLM...';
	defaultOption.disabled = true;
	dropdown.appendChild(defaultOption);
	
	llms.forEach(llm => {
		const option = document.createElement('option');
		option.value = llm.id;
		option.textContent = llm.name;
		dropdown.appendChild(option);
	});
	
	// Set the selected value if it exists in the new list.
	if (selectedLlmId && dropdown.querySelector(`option[value="${selectedLlmId}"]`)) {
		dropdown.value = selectedLlmId;
	} else {
		dropdown.value = '';
	}
}

/**
 * Initializes the LLM selector component. This is now an exported function.
 * @param {Array} llms - The initial list of LLMs from the server.
 * @param {string} lastSelectedLlm - The ID of the last used LLM.
 */
export function initializeLlmSelector(llms, lastSelectedLlm) {
	populateLlmDropdown(llms, lastSelectedLlm);
};

/**
 * Sets up event listeners for the LLM dropdown and refresh button.
 * This function is called from main.js to keep all listener setups in one place.
 */
export function setupLlmListeners() {
	// Save the selected LLM to the server when the user changes the dropdown.
	document.getElementById('llm-dropdown').addEventListener('change', function () {
		const selectedLlmId = this.value;
		if (selectedLlmId) {
			postData({action: 'save_selected_llm', llmId: selectedLlmId})
				.catch(err => console.error('Failed to save selected LLM:', err));
		}
	});
	
	document.getElementById('refresh-llms').addEventListener('click', async function () {
		const refreshButton = this;
		const icon = refreshButton.querySelector('i');
		const currentSelectedId = document.getElementById('llm-dropdown').value;
		
		icon.classList.add('fa-spin');
		refreshButton.disabled = true;
		showLoading('Refreshing LLMs...');
		
		try {
			const response = await postData({action: 'refresh_llms'});
			if (response.success) {
				populateLlmDropdown(response.llms, currentSelectedId);
				alert('LLM list updated successfully.');
			} else {
				throw new Error(response.error || 'Unknown error during refresh.');
			}
		} catch (error) {
			console.error('Failed to refresh LLM list:', error);
			alert(`Error refreshing LLMs: ${error.message}`);
		} finally {
			icon.classList.remove('fa-spin');
			refreshButton.disabled = false;
			hideLoading();
		}
	});
}
