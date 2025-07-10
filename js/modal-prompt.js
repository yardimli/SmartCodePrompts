// SmartCodePrompts/js/modal-prompt.js

let prompt_modal = null;
let prompt_modal_title = null;
let prompt_modal_message = null;
let prompt_modal_input = null;
let confirm_btn = null;
let cancel_btn = null;
let form = null;

// A variable to hold the resolve function of the promise, making it accessible to event listeners.
let resolve_promise = null;

/**
 * Initializes the prompt modal element references and sets up its event listeners.
 */
export function initialize_prompt_modal() {
	prompt_modal = document.getElementById('prompt_modal');
	prompt_modal_title = document.getElementById('prompt-modal-title');
	prompt_modal_message = document.getElementById('prompt-modal-message');
	prompt_modal_input = document.getElementById('prompt-modal-input');
	confirm_btn = document.getElementById('prompt-modal-confirm-btn');
	cancel_btn = document.getElementById('prompt-modal-cancel-btn');
	form = prompt_modal ? prompt_modal.querySelector('form.modal-box-form') : null;
	
	if (!prompt_modal || !confirm_btn || !cancel_btn || !prompt_modal_input || !form) {
		console.error('Prompt modal elements not found. Prompt functionality will be disabled.');
		return;
	}
	
	const handleConfirm = () => {
		if (resolve_promise) {
			resolve_promise(prompt_modal_input.value);
			resolve_promise = null; // Clear resolver
		}
		prompt_modal.close();
	};
	
	confirm_btn.addEventListener('click', handleConfirm);
	
	// Handle form submission (e.g., pressing Enter in the input)
	form.addEventListener('submit', (e) => {
		e.preventDefault();
		handleConfirm();
	});
	
	cancel_btn.addEventListener('click', () => {
		if (resolve_promise) {
			resolve_promise(null); // Resolve with null on cancellation
			resolve_promise = null;
		}
		prompt_modal.close();
	});
	
	// Handle closing via the ESC key
	prompt_modal.addEventListener('close', () => {
		if (resolve_promise) {
			resolve_promise(null);
			resolve_promise = null;
		}
	});
}

/**
 * Displays a custom prompt modal for user input.
 * @param {string} message - The main message to display.
 * @param {string} [title='Input Required'] - The title for the modal.
 * @param {string} [defaultValue=''] - The default value for the input field.
 * @returns {Promise<string|null>} A promise that resolves with the input text if confirmed, or null otherwise.
 */
export function show_prompt(message, title = 'Input Required', defaultValue = '') {
	if (!prompt_modal || !prompt_modal_title || !prompt_modal_message || !prompt_modal_input) {
		console.warn('Prompt modal not initialized, falling back to native prompt.');
		return Promise.resolve(prompt(message, defaultValue));
	}
	
	return new Promise((resolve) => {
		resolve_promise = resolve;
		prompt_modal_title.textContent = title;
		prompt_modal_message.textContent = message;
		prompt_modal_input.value = defaultValue;
		prompt_modal.showModal();
		prompt_modal_input.focus();
		prompt_modal_input.select();
	});
}
