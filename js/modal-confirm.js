// SmartCodePrompts/js/modal-confirm.js

let confirm_modal = null;
let confirm_modal_title = null;
let confirm_modal_message = null;
let confirm_btn = null;
let cancel_btn = null;

// A variable to hold the resolve function of the promise, making it accessible to event listeners.
let resolve_promise = null;

/**
 * Initializes the confirm modal element references and sets up its event listeners.
 */
export function initialize_confirm_modal () {
	confirm_modal = document.getElementById('confirm_modal');
	confirm_modal_title = document.getElementById('confirm-modal-title');
	confirm_modal_message = document.getElementById('confirm-modal-message');
	confirm_btn = document.getElementById('confirm-modal-confirm-btn');
	cancel_btn = document.getElementById('confirm-modal-cancel-btn');
	
	if (confirm_modal && confirm_btn && cancel_btn) {
		confirm_btn.addEventListener('click', () => {
			if (resolve_promise) {
				resolve_promise(true); // Resolve with true on confirmation
			}
			confirm_modal.close();
		});
		
		cancel_btn.addEventListener('click', () => {
			if (resolve_promise) {
				resolve_promise(false); // Resolve with false on cancellation
			}
			confirm_modal.close();
		});
		
		// Handle closing via the ESC key, which should be treated as a cancellation.
		confirm_modal.addEventListener('close', () => {
			if (resolve_promise) {
				resolve_promise(false);
				resolve_promise = null; // Clear the resolver to prevent multiple resolutions
			}
		});
	}
}

/**
 * Displays a custom confirmation modal.
 * Replaces the native browser confirm().
 * @param {string} message - The main message to display.
 * @param {string} [title='Confirmation'] - The title for the modal.
 * @returns {Promise<boolean>} A promise that resolves to true if the user confirms, false otherwise.
 */
export function show_confirm (message, title = 'Confirmation') {
	if (!confirm_modal || !confirm_modal_title || !confirm_modal_message) {
		// Fallback to native confirm if modal is not ready for any reason.
		console.warn('Confirm modal not initialized, falling back to native confirm.');
		return Promise.resolve(confirm(message));
	}
	
	// Return a new promise that will be resolved by our event listeners.
	return new Promise((resolve) => {
		resolve_promise = resolve;
		confirm_modal_title.textContent = title;
		confirm_modal_message.textContent = message;
		confirm_modal.showModal();
	});
}
