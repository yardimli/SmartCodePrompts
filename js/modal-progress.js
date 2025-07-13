// SmartCodePrompts/js/modal-progress.js

let progress_modal = null;
let title_el = null;
let text_el = null;
let bar_el = null;
let stop_button = null;
let stop_callback = null;

/**
 * Initializes the progress modal elements and sets up the stop button listener.
 */
export function initialize_progress_modal () {
	progress_modal = document.getElementById('progress_modal');
	title_el = document.getElementById('progress-modal-title');
	text_el = document.getElementById('progress-modal-text');
	bar_el = document.getElementById('progress-modal-bar');
	stop_button = document.getElementById('progress-modal-stop-button');
	
	if (stop_button) {
		stop_button.addEventListener('click', () => {
			if (typeof stop_callback === 'function') {
				text_el.textContent = 'Stopping operation...';
				stop_button.disabled = true; // MODIFIED: Disable button after click to prevent multiple calls.
				stop_callback();
			}
		});
	}
}

/**
 * Shows the progress modal.
 * @param {string} title - The title for the modal.
 * @param {Function|null} on_stop - The callback function to execute when the stop button is clicked.
 * @param {string} [initial_message='Initializing...'] - The initial message to display.
 */
export function show_progress_modal (title, on_stop, initial_message = 'Initializing...') {
	if (!progress_modal) return;
	
	title_el.textContent = title;
	text_el.textContent = initial_message; // MODIFIED: Use the new parameter for the initial message.
	bar_el.value = 0;
	bar_el.removeAttribute('max'); // Indeterminate state initially
	stop_callback = on_stop;
	
	if (stop_button) {
		// MODIFIED: Hide the stop button if no callback is provided for a cleaner look.
		stop_button.classList.toggle('hidden', !on_stop);
		// MODIFIED: Ensure the button is enabled when the modal is shown.
		stop_button.disabled = false;
	}
	
	progress_modal.showModal();
}

/**
 * Updates the progress indicator in the modal.
 * @param {number} current - The current progress value.
 * @param {number} total - The total value for the progress.
 * @param {string} message - The status message to display.
 */
export function update_progress (current, total, message) {
	if (!progress_modal || !progress_modal.open) return;
	
	text_el.textContent = message;
	bar_el.max = total;
	bar_el.value = current;
}

/**
 * Hides the progress modal.
 */
export function hide_progress_modal () {
	if (!progress_modal) return;
	progress_modal.close();
	stop_callback = null; // Clear callback
}
