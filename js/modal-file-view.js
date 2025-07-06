// SmartCodePrompts/js/modal-file-view.js
import {post_data} from './utils.js';
import {get_current_project} from './state.js';

let file_view_modal = null;

/**
 * Initializes the file view modal element reference.
 */
export function initialize_file_view_modal () {
	file_view_modal = document.getElementById('file_view_modal');
};

/**
 * Opens a modal to display the file's content in a textarea.
 * @param {HTMLElement} target - The file-entry element that was clicked.
 */
export async function handle_file_name_click (target) {
	if (!file_view_modal) return;
	const file_path = target.dataset.path;
	const title_el = document.getElementById('file-view-modal-title');
	const content_el = document.getElementById('file-view-modal-content');
	
	title_el.textContent = `Content of ${file_path}`;
	content_el.value = 'Loading file content...';
	file_view_modal.showModal();
	
	try {
		const current_project = get_current_project();
		const data = await post_data({
			action: 'get_file_content',
			project_path: current_project.path,
			path: file_path
		});
		
		content_el.value = data.content || 'File is empty or could not be loaded.';
		
	} catch (error) {
		content_el.value = `Error fetching file content: ${error.message}`;
	}
};
