// SmartCodePrompts/js/modal-about.js

let about_modal = null;

/**
 * Initializes the about modal element reference.
 */
export function initialize_about_modal () {
	about_modal = document.getElementById('about_modal');
};

/**
 * Opens the about modal.
 */
export function open_about_modal () {
	if (about_modal) {
		about_modal.showModal();
	}
};

/**
 * Sets up event listeners for the about modal.
 */
export function setup_about_modal_listeners () {
	const about_button = document.getElementById('about-modal-button');
	if (about_button) {
		about_button.addEventListener('click', (e) => {
			e.preventDefault();
			open_about_modal();
		});
	}
};
