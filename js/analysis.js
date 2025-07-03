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
 * NEW: Performs the re-analysis call to the backend and handles the response.
 * @param {boolean} forceReanalysis - Whether to force re-analysis of all files.
 */
async function performReanalysis(forceReanalysis) {
	const llmId = document.getElementById('llm-dropdown').value;
	const currentProject = getCurrentProject();
	
	// These checks are done before showing the modal, but are included as a safeguard.
	if (!llmId || !currentProject) {
		// Alerts are handled by the calling function.
		return;
	}
	
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
		
		hideLoading(); // Hide loading indicator before showing the alert.
		
		let summaryMessage = `Re-analysis complete.\n` +
			`- Files re-analyzed: ${response.analyzed}\n` +
			`- Files skipped (up-to-date): ${response.skipped}`;
		
		if (response.errors && response.errors.length > 0) {
			summaryMessage += `\n\nErrors occurred for ${response.errors.length} file(s):\n- ${response.errors.join('\n- ')}\n\nCheck the console for more details.`;
		}
		alert(summaryMessage);
		
		// Reload the page to reflect any changes in the file tree (e.g., analysis icons).
		// The app state (open folders, etc.) is restored on load.
		window.location.reload();
		
	} catch (error) {
		hideLoading(); // Ensure loading is hidden on error.
		console.error('Failed to re-analyze files:', error);
		alert(`An error occurred during re-analysis: ${error.message}`);
	}
}


/**
 * MODIFIED: Sets up the event listener for the "Re-analyze Files" button.
 * Prompts the user via a modal to choose between a standard or forced re-analysis.
 * This assumes a button with id "reanalyze-files" and a modal with id "reanalysisModal" exist in the HTML.
 */
export function setupReanalysisButtonListener() {
	const reanalyzeButton = document.getElementById('reanalyze-files');
	const reanalysisModalEl = document.getElementById('reanalysisModal');
	
	// Silently exit if the required elements don't exist.
	if (!reanalyzeButton || !reanalysisModalEl) {
		return;
	}
	
	// Initialize the Bootstrap modal instance.
	const reanalysisModal = new bootstrap.Modal(reanalysisModalEl);
	
	// The main button click now just validates and shows the modal.
	reanalyzeButton.addEventListener('click', function () {
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
		reanalysisModal.show();
	});
	
	// Add listeners for the buttons inside the modal to trigger the analysis.
	document.getElementById('reanalyzeModifiedOnlyButton').addEventListener('click', async () => {
		reanalysisModal.hide();
		await performReanalysis(false); // `force` is false for modified only.
	});
	
	document.getElementById('reanalyzeForceAllButton').addEventListener('click', async () => {
		reanalysisModal.hide();
		await performReanalysis(true); // `force` is true for force all.
	});
}
