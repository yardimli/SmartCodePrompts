// SmartCodePrompts/js/modal-analysis.js
import {post_data} from './utils.js';
import {get_current_project} from './state.js';

let analysis_modal = null;

/**
 * Initializes the analysis modal element reference.
 */
export function initialize_analysis_modal () {
	analysis_modal = document.getElementById('analysis_modal');
};

/**
 * Opens the analysis modal and displays the analysis content for a file.
 * @param {HTMLElement} target - The analysis icon element that was clicked.
 */
export async function handle_analysis_icon_click (target) {
	if (!analysis_modal) return;
	const file_path = target.dataset.path;
	const title_el = document.getElementById('analysis-modal-title');
	const content_el = document.getElementById('analysis-modal-content');
	
	title_el.textContent = `Analysis for ${file_path}`;
	content_el.value = 'Loading analysis data...';
	analysis_modal.showModal();
	
	try {
		const current_project = get_current_project();
		const data = await post_data({
			action: 'get_file_analysis',
			project_path: current_project.path,
			file_path: file_path
		});
		
		let body_content = 'No analysis data found for this file.';
		if (data.file_overview || data.functions_overview) {
			const content_parts = [];
			
			if (data.file_overview) {
				try {
					const parsed = JSON.parse(data.file_overview);
					content_parts.push('--- FILE OVERVIEW ---\n' + JSON.stringify(parsed, null, 2));
				} catch (e) {
					content_parts.push('--- FILE OVERVIEW ---\n' + data.file_overview);
				}
			}
			
			if (data.functions_overview) {
				try {
					const parsed = JSON.parse(data.functions_overview);
					content_parts.push('\n\n--- FUNCTIONS & LOGIC ---\n' + JSON.stringify(parsed, null, 2));
				} catch (e) {
					content_parts.push('\n\n--- FUNCTIONS & LOGIC ---\n' + data.functions_overview);
				}
			}
			body_content = content_parts.join('');
		}
		
		content_el.value = body_content;
		
	} catch (error) {
		content_el.value = `Error fetching analysis: ${error.message}`;
	}
};
