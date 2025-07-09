// SmartCodePrompts/js/modal-api-key.js

import { post_data } from './utils.js';
import { show_alert } from './modal-alert.js';

let modal = null;
let open_button = null;
let save_button = null;
let close_button = null;
let test_button = null;
let key_input = null;
let key_status = null;
let feedback_div = null;

/**
 * Initializes the API key modal elements.
 */
export function initialize_api_key_modal() {
	modal = document.getElementById('api_key_modal');
	open_button = document.getElementById('api-key-modal-button');
	save_button = document.getElementById('api-key-modal-save-button');
	close_button = document.getElementById('api-key-modal-close-button');
	test_button = document.getElementById('api-key-test-button');
	key_input = document.getElementById('api-key-input');
	key_status = document.getElementById('api-key-status');
	feedback_div = document.getElementById('api-key-feedback');
}

/**
 * Updates the status indicator in the modal based on whether a key is set.
 * @param {boolean} is_set - True if an API key is configured.
 */
export function update_api_key_status(is_set) {
	if (!key_status) return;
	if (is_set) {
		key_status.textContent = 'Key is set';
		key_status.className = 'label-text-alt text-success';
	} else {
		key_status.textContent = 'Key not set';
		key_status.className = 'label-text-alt text-error';
	}
}

/**
 * Sets up event listeners for the API key modal.
 */
export function setup_api_key_modal_listeners() {
	if (!modal || !open_button) return;
	
	// Open the modal
	open_button.addEventListener('click', () => {
		key_input.value = ''; // Clear input for security
		feedback_div.innerHTML = ''; // Clear previous feedback
		modal.showModal();
	});
	
	// Close the modal
	close_button.addEventListener('click', () => {
		modal.close();
	});
	
	// Test the key
	test_button.addEventListener('click', async () => {
		const api_key = key_input.value.trim();
		if (!api_key) {
			feedback_div.textContent = 'Please enter a key to test.';
			feedback_div.className = 'text-sm mt-2 text-warning';
			return;
		}
		
		test_button.disabled = true;
		test_button.classList.add('loading');
		feedback_div.textContent = 'Testing...';
		feedback_div.className = 'text-sm mt-2 text-info';
		
		try {
			// We use the 'refresh_llms' action and pass the key to test it.
			const response = await post_data({ action: 'refresh_llms', api_key: api_key });
			if (response.success) {
				feedback_div.textContent = 'Success! Key is valid.';
				feedback_div.className = 'text-sm mt-2 text-success';
			} else {
				throw new Error(response.error || 'Unknown error during test.');
			}
		} catch (error) {
			feedback_div.textContent = `Test failed: ${error.message}`;
			feedback_div.className = 'text-sm mt-2 text-error';
		} finally {
			test_button.disabled = false;
			test_button.classList.remove('loading');
		}
	});
	
	// Save the key
	save_button.addEventListener('click', async () => {
		const api_key = key_input.value.trim();
		if (!api_key) {
			// If user saves an empty field, just close.
			modal.close();
			return;
		}
		
		try {
			await post_data({ action: 'save_api_key', api_key: api_key });
			update_api_key_status(true);
			modal.close();
			show_alert('API Key saved successfully.');
		} catch (error) {
			show_alert(`Failed to save API key: ${error.message}`, 'Error');
		}
	});
}
