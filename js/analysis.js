// SmartCodePrompts/js/analysis.js
import {show_loading, hide_loading, post_data} from './utils.js';
import {get_current_project} from './state.js';

/**
 * This function now contains the logic for analyzing selected files.
 * It is called from the new analysis options modal.
 */
async function perform_selection_analysis() {
	const checked_boxes = Array.from(document.querySelectorAll('#file-tree input[type="checkbox"]:checked'));
	// MODIFIED: Use the dedicated analysis LLM dropdown.
	const llm_id = document.getElementById('llm-dropdown-analysis').value;
	const temperature = document.getElementById('temperature-slider').value;
	
	if (checked_boxes.length === 0) {
		alert('Please select at least one file to analyze.');
		return;
	}
	// Note: LLM check is already performed before opening the modal, so it's not strictly needed here, but good for safety.
	if (!llm_id) {
		alert('Please select an LLM for Analysis to perform the analysis.');
		return;
	}
	
	const total_files = checked_boxes.length;
	let files_analyzed = 0;
	let files_skipped = 0;
	let errors = [];
	const current_project = get_current_project();
	
	for (let i = 0; i < total_files; i++) {
		const checkbox = checked_boxes[i];
		const file_path = checkbox.dataset.path;
		const file_name = file_path.split('/').pop();
		show_loading(`Analyzing ${i + 1}/${total_files}: ${file_name}`);
		try {
			const response = await post_data({
				action: 'analyze_file',
				project_path: current_project.path,
				file_path: file_path,
				llm_id: llm_id,
				temperature: parseFloat(temperature),
				force: true // MODIFIED: Force re-analysis for selected files.
			});
			
			if (response.status === 'analyzed') {
				files_analyzed++;
				const li = checkbox.closest('li');
				// Check if an icon for this file already exists to prevent duplicates
				if (li && !li.querySelector('.analysis-icon')) {
					const icon = document.createElement('i');
					// MODIFIED: Replaced Font Awesome icon with Bootstrap Icon.
					icon.className = 'bi bi-info-circle analysis-icon text-info hover:text-info-focus cursor-pointer align-middle mr-1';
					icon.dataset.path = file_path;
					icon.title = 'View Analysis';
					const file_span = li.querySelector('.file');
					if (file_span) {
						file_span.before(icon);
					}
				}
			} else if (response.status === 'skipped') {
				files_skipped++;
			}
		} catch (error) {
			console.error(`Failed to analyze ${file_path}:`, error);
			errors.push(`${file_path}: ${error.message}`);
		}
	}
	
	hide_loading();
	
	let summary_message = `Analysis complete.\n- Total files selected: ${total_files}\n- Successfully analyzed: ${files_analyzed}\n- Skipped (up-to-date): ${files_skipped}`;
	if (errors.length > 0) {
		summary_message += `\n\nErrors occurred for ${errors.length} file(s):\n- ${errors.join('\n- ')}\n\nCheck the console for more details.`;
	}
	alert(summary_message);
}

/**
 * Performs the re-analysis call to the backend and handles the response.
 * The show/hide loading calls have been removed as the new status bar provides progress feedback.
 * @param {boolean} force_reanalysis - Whether to force re-analysis of all files.
 */
async function perform_reanalysis(force_reanalysis) {
	// MODIFIED: Use the dedicated analysis LLM dropdown.
	const llm_id = document.getElementById('llm-dropdown-analysis').value;
	const current_project = get_current_project();
	const temperature = document.getElementById('temperature-slider').value;
	
	if (!llm_id || !current_project) {
		alert('Please select a project and an LLM for Analysis.');
		return;
	}
	
	try {
		const response = await post_data({
			action: 'reanalyze_modified_files',
			project_path: current_project.path,
			llm_id: llm_id,
			force: force_reanalysis,
			temperature: parseFloat(temperature)
		});
		
		let summary_message = `Re-analysis complete.\n` +
			`- Files re-analyzed: ${response.analyzed}\n` +
			`- Files skipped (up-to-date): ${response.skipped}`;
		
		if (response.errors && response.errors.length > 0) {
			summary_message += `\n\nErrors occurred for ${response.errors.length} file(s):\n- ${response.errors.join('\n- ')}\n\nCheck the console for more details.`;
		}
		alert(summary_message);
	} catch (error) {
		console.error('Failed to re-analyze files:', error);
		alert(`An error occurred during re-analysis: ${error.message}`);
	}
}

/**
 * Sets up event listeners for the analysis buttons in the right sidebar.
 */
export function setup_analysis_actions_listener() {
	const analyze_selected_btn = document.getElementById('analyze_selected_button');
	const reanalyze_modified_btn = document.getElementById('reanalyze_modified_only_button');
	// DELETED: Removed reference to the force re-analyze all button.
	
	if (analyze_selected_btn) {
		analyze_selected_btn.addEventListener('click', async () => {
			await perform_selection_analysis();
		});
	}
	
	if (reanalyze_modified_btn) {
		reanalyze_modified_btn.addEventListener('click', async () => {
			await perform_reanalysis(false);
		});
	}
	
	// DELETED: Removed event listener for the force re-analyze all button.
}
