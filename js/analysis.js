// SmartCodePrompts/js/analysis.js
import {post_data} from './utils.js';
import {get_current_project} from './state.js';
import {show_progress_modal, hide_progress_modal, update_progress} from './modal-progress.js';
import {show_alert} from './modal-alert.js';
import { get_all_settings } from './settings.js';

let is_selection_analysis_cancelled = false;

/**
 * This function now contains the logic for analyzing selected files.
 * It is called from the new analysis options modal.
 */
export async function perform_selection_analysis () {
	const checked_boxes = Array.from(document.querySelectorAll('#file-tree input[type="checkbox"]:checked'));
	const llm_id = document.getElementById('llm-dropdown-analysis').value;
	const temperature = document.getElementById('temperature-slider').value;
	
	if (checked_boxes.length === 0) {
		show_alert('Please select at least one file to analyze.');
		return;
	}
	if (!llm_id) {
		show_alert('Please select an LLM for Analysis to perform the analysis.');
		return;
	}
	
	const total_files = checked_boxes.length;
	let files_analyzed = 0;
	let files_skipped = 0;
	let errors = [];
	const current_project = get_current_project();
	
	// Setup for progress modal and cancellation
	is_selection_analysis_cancelled = false; // Reset flag
	const stop_callback = () => {
		is_selection_analysis_cancelled = true;
		console.log('Selection analysis cancellation requested.');
	};
	show_progress_modal('Analyzing Selected Files', stop_callback);
	
	for (let i = 0; i < total_files; i++) {
		// Check for cancellation on each iteration
		if (is_selection_analysis_cancelled) {
			errors.push('Operation cancelled by user.');
			break;
		}
		
		const checkbox = checked_boxes[i];
		const file_path = checkbox.dataset.path;
		const file_name = file_path.split('/').pop();
		
		update_progress(i, total_files, `Analyzing ${i + 1}/${total_files}: ${file_name}`);
		try {
			const response = await post_data({
				action: 'analyze_file',
				project_path: current_project.path,
				file_path: file_path,
				llm_id: llm_id,
				// REMOVED: project_settings is no longer sent from the frontend.
				temperature: parseFloat(temperature),
				force: true
			});
			
			if (response.status === 'analyzed') {
				files_analyzed++;
				const li = checkbox.closest('li');
				if (li && !li.querySelector('.analysis-icon')) {
					const icon = document.createElement('i');
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
	
	hide_progress_modal();
	
	let summary_message = `Analysis ${is_selection_analysis_cancelled ? 'cancelled' : 'complete'}.\n- Total files selected: ${total_files}\n- Successfully analyzed: ${files_analyzed}\n- Skipped (up-to-date): ${files_skipped}`;
	if (errors.length > 0) {
		summary_message += `\n\nErrors occurred for ${errors.length} file(s):\n- ${errors.join('\n- ')}\n\nCheck the console for more details.`;
	}
	show_alert(summary_message, `Analysis ${is_selection_analysis_cancelled ? 'Cancelled' : 'Complete'}`);
}

/**
 * Performs the re-analysis by starting a backend process and polling for progress,
 * displaying it in a modal.
 * @param {boolean} force_reanalysis - Whether to force re-analysis of all files.
 * @returns {Promise<object>} A promise that resolves with the summary of the operation or rejects on failure/cancellation.
 */
export function perform_reanalysis (force_reanalysis) {
	return new Promise((resolve, reject) => {
		const llm_id = document.getElementById('llm-dropdown-analysis').value;
		const current_project = get_current_project();
		const temperature = document.getElementById('temperature-slider').value;
		
		if (!llm_id || !current_project) {
			const error_msg = 'Please select a project and an LLM for Analysis.';
			show_alert(error_msg);
			return reject(new Error(error_msg));
		}
		
		const stop_callback = () => {
			console.log('Requesting re-analysis cancellation.');
			post_data({action: 'cancel_analysis'}).catch(err => console.error('Failed to send cancel signal:', err));
			// The rejection will be handled by the polling loop when it sees the process is no longer running.
		};
		
		show_progress_modal('Re-analyzing Project', stop_callback);
		
		post_data({
			action: 'reanalyze_modified_files',
			project_path: current_project.path,
			llm_id: llm_id,
			// REMOVED: project_settings is no longer sent from the frontend.
			force: force_reanalysis,
			temperature: parseFloat(temperature)
		}).catch(error => {
			// This catches errors in *starting* the process.
			console.error('Failed to start re-analysis process:', error);
			hide_progress_modal();
			reject(error);
		});
		
		const poll_interval = setInterval(async () => {
			try {
				const stats = await post_data({action: 'get_session_stats'});
				const progress = stats.reanalysis;
				
				if (progress && progress.running) {
					update_progress(progress.current, progress.total, progress.message);
				} else {
					// Process is finished or was never started.
					clearInterval(poll_interval);
					hide_progress_modal();
					
					const summary = progress ? progress.summary : null;
					
					if (summary) {
						// Check for cancellation or errors.
						if (summary.errors && summary.errors.length > 0) {
							// If the only error is cancellation, it's a "soft" failure.
							const is_cancelled = summary.errors.length === 1 && summary.errors[0].includes('cancelled');
							const error_msg = is_cancelled ? 'Re-analysis cancelled by user.' : `Re-analysis completed with ${summary.errors.length} error(s).`;
							reject(new Error(error_msg));
						} else {
							resolve(summary); // Success
						}
					} else {
						// This case can happen if the process was cancelled very early or an unknown error occurred.
						reject(new Error('Re-analysis finished, but no summary was found.'));
					}
				}
			} catch (error) {
				console.error('Error polling for re-analysis status:', error);
				clearInterval(poll_interval);
				hide_progress_modal();
				reject(error);
			}
		}, 1000); // Poll every second
	});
}

export function setup_analysis_actions_listener () {
	const analyze_selected_btn = document.getElementById('analyze_selected_button');
	const reanalyze_modified_btn = document.getElementById('reanalyze_modified_only_button');
	
	if (analyze_selected_btn) {
		analyze_selected_btn.addEventListener('click', async () => {
			await perform_selection_analysis();
		});
	}
	
	if (reanalyze_modified_btn) {
		//The event listener is now async to handle the promise returned by perform_reanalysis.
		reanalyze_modified_btn.addEventListener('click', async () => {
			try {
				const summary = await perform_reanalysis(false);
				let summary_message = `Re-analysis complete.\n` +
					`- Files re-analyzed: ${summary.analyzed}\n` +
					`- Files skipped (up-to-date): ${summary.skipped}`;
				show_alert(summary_message, 'Re-analysis Complete');
			} catch (error) {
				// Errors (including cancellation) are caught here.
				show_alert(error.message, 'Re-analysis Failed');
			}
		});
	}
}
