// llm-php-helper/llm.js

document.addEventListener('DOMContentLoaded', function () {
	// This object will be attached to the window to expose the initializer function
	// to index.js, without polluting the global scope with multiple functions.
	window.llmHelper = window.llmHelper || {};
	
	/**
	 * Populates the LLM dropdown with a list of models.
	 * @param {Array} llms - An array of LLM objects, each with an 'id' and 'name'.
	 * @param {string} selectedLlmId - The ID of the LLM to pre-select.
	 */
	function populateLlmDropdown(llms, selectedLlmId) {
		const dropdown = document.getElementById('llm-dropdown');
		dropdown.innerHTML = ''; // Clear existing options
		
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
	 * Initializes the LLM selector component. This is called by index.js.
	 * @param {Array} llms - The initial list of LLMs from the server.
	 * @param {string} lastSelectedLlm - The ID of the last used LLM.
	 */
	window.llmHelper.initializeLlmSelector = (llms, lastSelectedLlm) => {
		populateLlmDropdown(llms, lastSelectedLlm);
	};
	
	// --- Event Listeners for LLM functionality ---
	
	// Save the selected LLM to the server when the user changes the dropdown.
	document.getElementById('llm-dropdown').addEventListener('change', function () {
		const selectedLlmId = this.value;
		if (selectedLlmId) {
			// postData is a global function defined in index.js
			postData({action: 'save_selected_llm', llmId: selectedLlmId})
				.catch(err => console.error('Failed to save selected LLM:', err));
		}
	});
	
	// Handle the click event for the LLM list refresh button.
	document.getElementById('refresh-llms').addEventListener('click', async function () {
		const refreshButton = this;
		const icon = refreshButton.querySelector('i');
		const currentSelectedId = document.getElementById('llm-dropdown').value;
		
		// Provide visual feedback during the refresh process.
		icon.classList.add('fa-spin');
		refreshButton.disabled = true;
		// showLoading is a global function defined in index.js
		showLoading('Refreshing LLMs...');
		
		try {
			// postData is a global function defined in index.js
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
			// Restore the button to its normal state.
			icon.classList.remove('fa-spin');
			refreshButton.disabled = false;
			// hideLoading is a global function defined in index.js
			hideLoading();
		}
	});
});
