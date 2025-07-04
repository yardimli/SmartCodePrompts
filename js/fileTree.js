// SmartCodePrompts/js/fileTree.js
import {showLoading, hideLoading, getParentPath, postData} from './utils.js';
import {getCurrentProject, getContentFooterPrompt, getLastSmartPrompt, saveCurrentProjectState} from './state.js';
import {handleAnalysisIconClick, handleSearchIconClick} from './modals.js';

//A cache for the content of all selected files to avoid re-fetching on prompt changes.
let cachedFileContentString = '';
//A handle for the file tree update polling interval.
let fileTreeUpdateInterval = null;

/**
 * NEW: Gets a specific filetype class for styling based on the filename's extension.
 * @param {string} filename - The name of the file.
 * @returns {string} The CSS class for the filetype, or an empty string if no specific icon is found.
 */
function getFiletypeClass(filename) {
	const extension = filename.split('.').pop().toLowerCase();
	const extensionMap = {
		js: 'filetype-js',
		mjs: 'filetype-js',
		ts: 'filetype-ts',
		tsx: 'filetype-tsx',
		css: 'filetype-css',
		scss: 'filetype-scss',
		html: 'filetype-html',
		json: 'filetype-json',
		md: 'filetype-md',
		py: 'filetype-py',
		php: 'filetype-php',
		sql: 'filetype-sql',
		yml: 'filetype-yml',
		yaml: 'filetype-yml',
		sh: 'filetype-sh',
		java: 'filetype-java',
		cs: 'filetype-cs',
		svg: 'filetype-svg',
		txt: 'filetype-txt'
	};
	return extensionMap[extension] || ''; // Return mapped class or empty string
}

/**
 * An internal helper to update the main textarea from the cache and current prompts.
 */
function _updateTextareaWithCachedContent() {
	const selectedContentEl = document.getElementById('selected-content');
	if (!selectedContentEl) return;
	
	const contentFooterPrompt = getContentFooterPrompt();
	const userPrompt = getLastSmartPrompt();
	
	// Combine cached file content with the footer.
	selectedContentEl.value = cachedFileContentString + contentFooterPrompt;
	
	// The placeholder replacement logic.
	const searchStr = '${userPrompt}';
	const lastIndex = selectedContentEl.value.lastIndexOf(searchStr);
	
	if (lastIndex !== -1) {
		selectedContentEl.value =
			selectedContentEl.value.substring(0, lastIndex) +
			userPrompt +
			selectedContentEl.value.substring(lastIndex + searchStr.length);
	}
}

/**
 * Fetches and displays the contents of a folder in the file tree.
 * @param {string} path - The path of the folder to load.
 * @param {HTMLElement|null} element - The folder element that was clicked.
 * @returns {Promise<void>}
 */
export function loadFolders(path, element) {
	return new Promise(async (resolve, reject) => {
		const currentProject = getCurrentProject();
		if (!currentProject) return reject(new Error('No project selected'));
		try {
			const response = await postData({
				action: 'get_folders',
				path: path,
				rootIndex: currentProject.rootIndex,
				projectPath: currentProject.path
			});
			const fileTree = document.getElementById('file-tree');
			if (element) {
				const nextUl = element.nextElementSibling;
				if (nextUl && nextUl.tagName === 'UL') {
					nextUl.remove();
				}
			} else {
				fileTree.innerHTML = '';
			}
			if (!response || (!response.folders.length && !response.files.length)) {
				if (element) element.classList.remove('open');
				return resolve();
			}
			const ul = document.createElement('ul');
			ul.style.display = 'none';
			ul.className = 'pl-4'; // Tailwind class for padding-left
			let content = '';
			response.folders.sort((a, b) => a.localeCompare(b));
			response.files.sort((a, b) => a.name.localeCompare(b.name));
			response.folders.forEach(folder => {
				const fullPath = `${path}/${folder}`;
				// MODIFIED: Replaced Font Awesome icons with Bootstrap Icons.
				content += `
                    <li>
                        <span class="folder" data-path="${fullPath}">
                            ${folder}
                            <span class="folder-controls inline-block align-middle ml-2">
                                <i class="bi bi-search folder-search-icon text-base-content/40 hover:text-base-content/80 cursor-pointer" title="Search in this folder"></i>
                                <i class="bi bi-eraser folder-clear-icon text-base-content/40 hover:text-base-content/80 cursor-pointer ml-1" title="Clear selection in this folder"></i>
                            </span>
                        </span>
                    </li>`;
			});
			response.files.forEach(fileInfo => {
				const filetypeClass = getFiletypeClass(fileInfo.name); // MODIFIED: Get filetype class for specific icons.
				// MODIFIED: Replaced Font Awesome icons with Bootstrap Icons.
				const analysisIcon = fileInfo.has_analysis ? `<i class="bi bi-info-circle analysis-icon text-info hover:text-info-focus cursor-pointer align-middle mr-1" data-path="${fileInfo.path}" title="View Analysis"></i>` : '';
				const modifiedIcon = fileInfo.is_modified ? `<i class="bi bi-exclamation-triangle-fill text-warning align-middle ml-1" title="File has been modified since last analysis"></i>` : '';
				content += `
                    <li>
                        <div class="checkbox-wrapper">
                            <input type="checkbox" data-path="${fileInfo.path}" class="checkbox checkbox-xs checkbox-primary align-middle">
                        </div>
                        ${analysisIcon}
                        <span class="file ${filetypeClass} align-middle" title="${fileInfo.path}">${fileInfo.name}</span>
                        ${modifiedIcon}
                    </li>`;
			});
			ul.innerHTML = content;
			if (element) {
				element.after(ul);
			} else {
				fileTree.appendChild(ul);
			}
			ul.style.display = 'block';
			resolve();
		} catch (error) {
			console.error(`Error loading folders for path ${path}:`, error);
			if (element) element.classList.remove('open');
			reject(error);
		}
	});
}

/**
 * Gathers content from all selected files and displays it in the main textarea.
 * This function now caches file content and uses a helper to render the textarea.
 */
export async function updateSelectedContent() {
	const checkedBoxes = document.querySelectorAll('#file-tree input[type="checkbox"]:checked');
	const selectedContentEl = document.getElementById('selected-content');
	
	if (checkedBoxes.length === 0) {
		cachedFileContentString = '';
		selectedContentEl.value = '';
		return;
	}
	
	showLoading(`Loading ${checkedBoxes.length} file(s)...`);
	
	const requestPromises = Array.from(checkedBoxes).map(box => {
		const path = box.dataset.path;
		return postData({ action: 'get_file_content', rootIndex: getCurrentProject().rootIndex, path: path })
			.then(response => `${path}:\n\n${response.content}\n\n`)
			.catch(error => `/* --- ERROR loading ${path}: ${error.message || 'Unknown error'} --- */\n\n`);
	});
	
	try {
		const results = await Promise.all(requestPromises);
		cachedFileContentString = results.join(''); // Update the cache.
		_updateTextareaWithCachedContent();
		
	} catch (error) {
		console.error('Error updating content:', error);
		selectedContentEl.value = '/* --- An unexpected error occurred while loading file contents. --- */';
		cachedFileContentString = '';
	} finally {
		hideLoading();
	}
}

/**
 * Updates only the prompt portion of the main textarea using cached file content.
 * This avoids re-fetching all file contents, making prompt updates fast.
 */
export function refreshPromptDisplay() {
	_updateTextareaWithCachedContent();
}

function restoreCheckedStates(selectedFiles) {
	document.querySelectorAll('#file-tree input[type="checkbox"]').forEach(cb => (cb.checked = false));
	selectedFiles.forEach(path => {
		const checkbox = document.querySelector(`#file-tree input[type="checkbox"][data-path="${path}"]`);
		if (checkbox) {
			checkbox.checked = true;
		} else {
			console.warn(`Checkbox not found during restore for path: ${path}`);
		}
	});
}

/**
 * Restores the UI state (open folders, checked files) from saved data.
 * @param {object} state - The state object with `openFolders` and `selectedFiles`.
 */
export async function restoreState(state) {
	console.log('Restoring state:', state);
	const currentProject = getCurrentProject();
	const pathsToEnsureOpen = new Set(state.openFolders || []);
	(state.selectedFiles || []).forEach(filePath => {
		let parentPath = getParentPath(filePath);
		while (parentPath && parentPath !== currentProject.path) {
			pathsToEnsureOpen.add(parentPath);
			parentPath = getParentPath(parentPath);
		}
	});
	const sortedPaths = [...pathsToEnsureOpen].sort((a, b) => a.split('/').length - b.split('/').length);
	for (const path of sortedPaths) {
		const folderElement = document.querySelector(`#file-tree .folder[data-path="${path}"]`);
		if (folderElement && !folderElement.classList.contains('open')) {
			folderElement.classList.add('open');
			await loadFolders(path, folderElement);
		}
	}
	restoreCheckedStates(state.selectedFiles || []);
	updateSelectedContent();
}

/**
 * Ensures a file's parent folders are open in the tree, loading them if necessary.
 * @param {string} filePath - The path of the file to make visible.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function ensureFileIsVisible(filePath) {
	const parts = filePath.split('/');
	let currentPath = parts[0];
	for (let i = 1; i < parts.length - 1; i++) {
		currentPath = `${currentPath}/${parts[i]}`;
		const folderElement = document.querySelector(`#file-tree .folder[data-path="${currentPath}"]`);
		if (folderElement && !folderElement.classList.contains('open')) {
			folderElement.classList.add('open');
			try {
				await loadFolders(currentPath, folderElement);
			} catch (error) {
				console.error(`Failed to open folder ${currentPath} while ensuring visibility`, error);
				return false;
			}
		}
	}
	return true;
}

/**
 * MODIFIED: Replaced the old DOM-diffing function with a simpler one that only handles
 * modification status icons based on data for all analyzed files in the project.
 * This function is called by the polling mechanism.
 * @param {object} updates - An object with `modified`, `unmodified`, and `deleted` file path arrays.
 */
function handleModificationStatusUpdates(updates) {
	const fileTree = document.getElementById('file-tree');
	if (!fileTree) return;
	
	let hasChanges = false;
	
	// Add 'modified' icon to files that have changed
	updates.modified.forEach(filePath => {
		const fileLi = fileTree.querySelector(`input[type="checkbox"][data-path="${filePath}"]`)?.closest('li');
		if (!fileLi) return;
		
		const existingIcon = fileLi.querySelector('.bi-exclamation-triangle-fill');
		if (!existingIcon) {
			const fileSpan = fileLi.querySelector('.file');
			if (fileSpan) {
				fileSpan.insertAdjacentHTML('afterend', ` <i class="bi bi-exclamation-triangle-fill text-warning align-middle ml-1" title="File has been modified since last analysis"></i>`);
				hasChanges = true;
			}
		}
	});
	
	// Remove 'modified' icon from files that are now back to their analyzed state
	updates.unmodified.forEach(filePath => {
		const fileLi = fileTree.querySelector(`input[type="checkbox"][data-path="${filePath}"]`)?.closest('li');
		if (!fileLi) return;
		
		const existingIcon = fileLi.querySelector('.bi-exclamation-triangle-fill');
		if (existingIcon) {
			existingIcon.remove();
			hasChanges = true;
		}
	});
	
	// Remove list items for files that have been deleted from the filesystem
	updates.deleted.forEach(filePath => {
		const fileLi = fileTree.querySelector(`input[type="checkbox"][data-path="${filePath}"]`)?.closest('li');
		if (fileLi) {
			// If the deleted file was selected, we need to update the content area
			const checkbox = fileLi.querySelector('input[type="checkbox"]');
			const wasChecked = checkbox && checkbox.checked;
			
			fileLi.remove();
			hasChanges = true;
			
			if (wasChecked) {
				// This will re-fetch content for remaining checked files
				updateSelectedContent();
			}
		}
	});
	
	if (hasChanges) {
		console.log('File tree icons updated due to filesystem changes.');
	}
}

/**
 * Stops the periodic polling for file tree updates.
 */
export function stopFileTreePolling() {
	if (fileTreeUpdateInterval) {
		clearInterval(fileTreeUpdateInterval);
		fileTreeUpdateInterval = null;
		console.log('File tree polling stopped.');
	}
}

/**
 * Starts the periodic polling for file tree updates.
 * MODIFIED: This now polls for the modification status of all analyzed files in the project,
 * rather than syncing the contents of open folders.
 */
export function startFileTreePolling() {
	stopFileTreePolling(); // Ensure no multiple intervals are running
	
	const pollInterval = 10000; // Poll every 10 seconds.
	
	fileTreeUpdateInterval = setInterval(async () => {
		const currentProject = getCurrentProject();
		if (!currentProject) {
			stopFileTreePolling();
			return;
		}
		
		// MODIFICATION: We no longer need to find open folders. The check is project-wide.
		
		try {
			// MODIFICATION: The action and payload have changed to check all analyzed files.
			const updates = await postData({
				action: 'check_folder_updates',
				rootIndex: currentProject.rootIndex,
				projectPath: currentProject.path
			});
			
			// MODIFICATION: Call the new handler function.
			handleModificationStatusUpdates(updates);
			
		} catch (error) {
			console.error('Error polling for file tree updates:', error);
		}
		
	}, pollInterval);
	// MODIFIED: Updated log message to reflect new functionality.
	console.log('File tree polling started for modification status.');
}


/**
 * Sets up delegated event listeners for the file tree container and its controls.
 * This function was created by moving logic out of main.js.
 */
export function setupFileTreeListeners() {
	const fileTree = document.getElementById('file-tree');
	
	// Delegated event listener for clicks within the file tree
	fileTree.addEventListener('click', async (e) => {
		const folder = e.target.closest('.folder');
		const searchIcon = e.target.closest('.folder-search-icon');
		const clearIcon = e.target.closest('.folder-clear-icon');
		const analysisIcon = e.target.closest('.analysis-icon');
		
		if (analysisIcon) {
			e.stopPropagation();
			handleAnalysisIconClick(analysisIcon);
			return;
		}
		
		if (searchIcon) {
			e.stopPropagation();
			handleSearchIconClick(searchIcon);
			return;
		}
		
		if (clearIcon) {
			e.stopPropagation();
			const folderPath = clearIcon.closest('.folder').dataset.path;
			if (!folderPath) return;
			const selector = `input[type="checkbox"][data-path^="${folderPath}/"]`;
			let uncheckCount = 0;
			document.querySelectorAll(selector).forEach(cb => {
				if (cb.checked) {
					cb.checked = false;
					uncheckCount++;
				}
			});
			if (uncheckCount > 0) {
				updateSelectedContent();
				saveCurrentProjectState();
			}
			return;
		}
		
		if (folder) {
			e.stopPropagation();
			const ul = folder.nextElementSibling;
			if (folder.classList.contains('open')) {
				folder.classList.remove('open');
				if (ul) ul.style.display = 'none';
				saveCurrentProjectState();
			} else {
				if (ul) {
					folder.classList.add('open');
					ul.style.display = 'block';
					saveCurrentProjectState();
				} else {
					showLoading('Loading folder...');
					folder.classList.add('open');
					try {
						await loadFolders(folder.dataset.path, folder);
						saveCurrentProjectState();
					} catch (err) {
						folder.classList.remove('open');
					} finally {
						hideLoading();
					}
				}
			}
		}
	});
	
	// Delegated listener for checkbox changes
	fileTree.addEventListener('change', (e) => {
		if (e.target.matches('input[type="checkbox"]')) {
			e.stopPropagation();
			updateSelectedContent();
			saveCurrentProjectState();
		}
	});
	
	// Event listener for the "Unselect All" button
	document.getElementById('unselect-all').addEventListener('click', function () {
		document.querySelectorAll('#file-tree input[type="checkbox"]').forEach(cb => (cb.checked = false));
		updateSelectedContent();
		saveCurrentProjectState();
	});
}
