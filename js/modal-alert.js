// SmartCodePrompts/js/modal-alert.js

let alert_modal = null;
let alert_modal_title = null;
let alert_modal_message = null;

/**
 * Initializes the alert modal element references.
 */
export function initialize_alert_modal () {
	alert_modal = document.getElementById('alert_modal');
	alert_modal_title = document.getElementById('alert-modal-title');
	alert_modal_message = document.getElementById('alert-modal-message');
}

/**
 * Displays a custom alert modal with a title and message.
 * Replaces the native browser alert().
 * @param {string} message - The main message to display.
 * @param {string} [title='Notification'] - The title for the modal.
 */
export function show_alert (message, title = 'Notification') {
	if (!alert_modal || !alert_modal_title || !alert_modal_message) {
		// Fallback to native alert if modal is not ready
		console.warn('Alert modal not initialized, falling back to native alert.');
		alert(message);
		return;
	}
	
	alert_modal_title.textContent = title;
	alert_modal_message.textContent = message;
	alert_modal.showModal();
}
