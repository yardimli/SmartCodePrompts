// SmartCodePrompts/js/analysis.js
import {showLoading, hideLoading, postData} from './utils.js';
import {getCurrentProject} from './state.js';

/**
 * This function now contains the logic for analyzing selected files.
 * It is called from the new analysis options modal.
 */
async function performSelectionAnalysis() {
	const checkedBoxes = Array.from(document.querySelectorAll('#file-tree input[type="checkbox"]:checked'));
	const llmId = document.getElementById('llm-dropdown').value;
	const temperature = document.getElementById('temperature-slider').value;
	
	if (checkedBoxes.length === 0) {
		alert('Please select at least one file to analyze.');
		return;
	}
	// Note: LLM check is already performed before opening the modal, so it's not strictly needed here, but good for safety.
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
				llmId: llmId,
				temperature: parseFloat(temperature)
			});
			
			if (response.status === 'analyzed') {
				filesAnalyzed++;
				const li = checkbox.closest('li');
				// Check if an icon for this file already exists to prevent duplicates
				if (li && !li.querySelector('.analysis-icon')) {
					const icon = document.createElement('i');
					// MODIFIED: Replaced Font Awesome icon with Bootstrap Icon.
					icon.className = 'bi bi-info-circle analysis-icon text-info hover:text-info-focus cursor-pointer align-middle mr-1';
					icon.dataset.path = filePath;
					icon.title = 'View Analysis';
					const fileSpan = li.querySelector('.file');
					if (fileSpan) {
						fileSpan.before(icon);
					}
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
}


/**
 * Performs the re-analysis call to the backend and handles the response.
 * The show/hide loading calls have been removed as the new status bar provides progress feedback.
 * @param {boolean} forceReanalysis - Whether to force re-analysis of all files.
 */
async function performReanalysis(forceReanalysis) {
	const llmId = document.getElementById('llm-dropdown').value;
	const currentProject = getCurrentProject();
	const temperature = document.getElementById('temperature-slider').value;
	
	if (!llmId || !currentProject) {
		return;
	}
	
	try {
		const response = await postData({
			action: 'reanalyze_modified_files',
			rootIndex: currentProject.rootIndex,
			projectPath: currentProject.path,
			llmId: llmId,
			force: forceReanalysis,
			temperature: parseFloat(temperature)
		});
		
		let summaryMessage = `Re-analysis complete.\n` +
			`- Files re-analyzed: ${response.analyzed}\n` +
			`- Files skipped (up-to-date): ${response.skipped}`;
		
		if (response.errors && response.errors.length > 0) {
			summaryMessage += `\n\nErrors occurred for ${response.errors.length} file(s):\n- ${response.errors.join('\n- ')}\n\nCheck the console for more details.`;
		}
		alert(summaryMessage);
		
		window.location.reload();
	} catch (error) {
		console.error('Failed to re-analyze files:', error);
		alert(`An error occurred during re-analysis: ${error.message}`);
	}
}

/**
 * Sets up event listeners for the analysis buttons in the right sidebar.
 */
export function setupAnalysisActionsListener() {
	const analyzeSelectedBtn = document.getElementById('analyzeSelectedButton');
	const reanalyzeModifiedBtn = document.getElementById('reanalyzeModifiedOnlyButton');
	const reanalyzeForceAllBtn = document.getElementById('reanalyzeForceAllButton');
	
	if (analyzeSelectedBtn) {
		analyzeSelectedBtn.addEventListener('click', async () => {
			await performSelectionAnalysis();
		});
	}
	
	if (reanalyzeModifiedBtn) {
		reanalyzeModifiedBtn.addEventListener('click', async () => {
			await performReanalysis(false);
		});
	}
	
	if (reanalyzeForceAllBtn) {
		reanalyzeForceAllBtn.addEventListener('click', async () => {
			await performReanalysis(true);
		});
	}
}
