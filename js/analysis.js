// llm-php-helper/js/analysis.js
import {showLoading, hideLoading, postData} from './utils.js';
import {getCurrentProject} from './state.js';

/**
 * Sets up the event listener for the main "Analyze Files" button.
 */
export function setupAnalysisButtonListener() {
	document.getElementById('analyze-files').addEventListener('click', async function () {
		const checkedBoxes = Array.from(document.querySelectorAll('#file-tree input[type="checkbox"]:checked'));
		const llmId = document.getElementById('llm-dropdown').value;
		
		if (checkedBoxes.length === 0) {
			alert('Please select at least one file to analyze.');
			return;
		}
		
		if (!llmId) {
			alert('Please select an LLM from the dropdown to perform the analysis.');
			return;
		}
		
		const totalFiles = checkedBoxes.length;
		let filesAnalyzed = 0;
		let filesSkipped = 0;
		let errors = [];
		const currentProject = getCurrentProject();
		
		for (let i = 0; i < totalFiles; i++) {
			const checkbox = checkedBoxes[i];
			const filePath = checkbox.dataset.path;
			const fileName = filePath.split('/').pop();
			showLoading(`Analyzing ${i + 1}/${totalFiles}: ${fileName}`);
			try {
				const response = await postData({
					action: 'analyze_file',
					rootIndex: currentProject.rootIndex,
					projectPath: currentProject.path,
					filePath: filePath,
					llmId: llmId
				});
				if (response.status === 'analyzed') {
					filesAnalyzed++;
					// Add the analysis icon to the UI without a full reload
					const fileSpan = checkbox.closest('li').querySelector('.file');
					if (fileSpan && !fileSpan.previousElementSibling.matches('.analysis-icon')) {
						const icon = document.createElement('i');
						icon.className = 'fas fa-info-circle analysis-icon';
						icon.dataset.path = filePath;
						icon.title = 'View Analysis';
						checkbox.parentElement.after(icon);
					}
				} else if (response.status === 'skipped') {
					filesSkipped++;
				}
			} catch (error) {
				console.error(`Failed to analyze ${filePath}:`, error);
				errors.push(`${filePath}: ${error.message}`);
			}
		}
		
		hideLoading();
		let summaryMessage = `Analysis complete.\n- Total files selected: ${totalFiles}\n- Successfully analyzed: ${filesAnalyzed}\n- Skipped (up-to-date): ${filesSkipped}`;
		if (errors.length > 0) {
			summaryMessage += `\n\nErrors occurred for ${errors.length} file(s):\n- ${errors.join('\n- ')}\n\nCheck the console for more details.`;
		}
		alert(summaryMessage);
	});
}

/**
 * NEW: Sets up the event listener for the "Re-analyze Files" button.
 * Prompts the user to choose between a standard or forced re-analysis.
 * This assumes a button with the id "reanalyze-files" exists in the HTML.
 */
export function setupReanalysisButtonListener() {
	const reanalyzeButton = document.getElementById('reanalyze-files');
	if (!reanalyzeButton) return; // Silently exit if the button doesn't exist.
	
	reanalyzeButton.addEventListener('click', async function () {
		const llmId = document.getElementById('llm-dropdown').value;
		if (!llmId) {
			alert('Please select an LLM from the dropdown to perform the analysis.');
			return;
		}
		
		const currentProject = getCurrentProject();
		if (!currentProject) {
			alert('No project selected.');
			return;
		}
		
		// MODIFIED: Ask the user for the re-analysis mode.
		// confirm() returns true for OK, false for Cancel.
		// We map OK -> force=true, Cancel -> force=false (modified only).
		const forceReanalysis = confirm(
			"Choose re-analysis mode:\n\n" +
			"▶ Click 'OK' to force re-analysis of ALL previously analyzed files (slower).\n\n" +
			"▶ Click 'Cancel' to re-analyze only MODIFIED files (faster)."
		);
		
		const mode = forceReanalysis ? 'Forcing re-analysis of all files...' : 'Re-analyzing modified files...';
		showLoading(mode);
		
		try {
			const response = await postData({
				action: 'reanalyze_modified_files',
				rootIndex: currentProject.rootIndex,
				projectPath: currentProject.path,
				llmId: llmId,
				force: forceReanalysis // Send the user's choice to the backend.
			});
			
			let summaryMessage = `Re-analysis complete.\n` +
				`- Files re-analyzed: ${response.analyzed}\n` +
				`- Files skipped (up-to-date): ${response.skipped}`;
			
			if (response.errors && response.errors.length > 0) {
				summaryMessage += `\n\nErrors occurred for ${response.errors.length} file(s):\n- ${response.errors.join('\n- ')}\n\nCheck the console for more details.`;
			}
			alert(summaryMessage);
			
		} catch (error) {
			console.error('Failed to re-analyze files:', error);
			alert(`An error occurred during re-analysis: ${error.message}`);
		} finally {
			hideLoading();
		}
	});
}
