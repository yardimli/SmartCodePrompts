// SmartCodePrompts/js/fileTree.js
import {showLoading, hideLoading, getParentPath, postData} from './utils.js';
import {getCurrentProject, getContentFooterPrompt, getLastSmartPrompt, saveCurrentProjectState} from './state.js';
import {handleAnalysisIconClick, handleSearchIconClick} from './modals.js';

//A cache for the content of all selected files to avoid re-fetching on prompt changes.
let cachedFileContentString = '';
//A handle for the file tree update polling interval.
let fileTreeUpdateInterval = null;

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
				content += `
                    <li>
                        <span class="folder" data-path="${fullPath}">
                            ${folder}
                            <span class="folder-controls inline-block align-middle ml-2">
                                <i class="fas fa-search folder-search-icon text-base-content/40 hover:text-base-content/80 cursor-pointer" title="Search in this folder"></i>
                                <i class="fas fa-eraser folder-clear-icon text-base-content/40 hover:text-base-content/80 cursor-pointer ml-1" title="Clear selection in this folder"></i>
                            </span>
                        </span>
                    </li>`;
			});
			response.files.forEach(fileInfo => {
				const analysisIcon = fileInfo.has_analysis ? `<i class="fas fa-info-circle analysis-icon text-info hover:text-info-focus cursor-pointer align-middle mr-1" data-path="${fileInfo.path}" title="View Analysis"></i>` : '';
				const modifiedIcon = fileInfo.is_modified ? `<i class="fa-solid fa-triangle-exclamation text-warning align-middle ml-1" title="File has been modified since last analysis"></i>` : '';
				content += `
                    <li>
                        <div class="checkbox-wrapper">
                            <input type="checkbox" data-path="${fileInfo.path}" class="checkbox checkbox-xs checkbox-primary align-middle">
                        </div>
                        ${analysisIcon}
                        <span class="file align-middle" title="${fileInfo.path}">${fileInfo.name}</span>
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
 * Processes updates from the server and surgically refreshes the DOM for open folders.
 * This prevents losing the state of sub-folders and checkbox selections.
 * @param {object} updates - An object where keys are folder paths and values are their current contents.
 */
function handleFileTreeUpdates(updates) {
	const fileTree = document.getElementById('file-tree');
	if (!fileTree) return;
	
	let hasChanges = false;
	
	for (const folderPath in updates) {
		const serverData = updates[folderPath];
		const folderElement = fileTree.querySelector(`.folder[data-path="${folderPath}"]`);
		if (!folderElement) continue;
		
		const ul = folderElement.nextElementSibling;
		if (!ul || ul.tagName !== 'UL') continue;
		
		// Create a map of current DOM nodes by their path for quick lookup
		const domNodesMap = new Map();
		ul.childNodes.forEach(li => {
			if (li.nodeType !== Node.ELEMENT_NODE) return;
			const folderSpan = li.querySelector('span.folder');
			const fileCheckbox = li.querySelector('input[type="checkbox"]');
			let path = null;
			if (folderSpan) {
				path = folderSpan.dataset.path;
			} else if (fileCheckbox) {
				path = fileCheckbox.dataset.path;
			}
			if (path) {
				domNodesMap.set(path, li);
			}
		});
		
		// Create a map of new data from server by path
		const serverItemsMap = new Map();
		serverData.folders.forEach(folderName => {
			const fullPath = `${folderPath}/${folderName}`;
			serverItemsMap.set(fullPath, {type: 'folder', name: folderName});
		});
		serverData.files.forEach(fileInfo => {
			serverItemsMap.set(fileInfo.path, {type: 'file', info: fileInfo});
		});
		
		// Compare and update/remove existing nodes
		for (const [path, liNode] of domNodesMap.entries()) {
			if (!serverItemsMap.has(path)) {
				// Item was deleted on server, remove from DOM
				ul.removeChild(liNode);
				hasChanges = true;
			} else {
				// Item exists, check for modifications (for files)
				const serverItem = serverItemsMap.get(path);
				if (serverItem.type === 'file') {
					const modifiedIcon = liNode.querySelector('.fa-triangle-exclamation');
					const shouldHaveIcon = serverItem.info.is_modified;
					if (shouldHaveIcon && !modifiedIcon) {
						const fileSpan = liNode.querySelector('.file');
						fileSpan.insertAdjacentHTML('afterend', ` <i class="fa-solid fa-triangle-exclamation text-warning align-middle ml-1" title="File has been modified since last analysis"></i>`);
						hasChanges = true;
					} else if (!shouldHaveIcon && modifiedIcon) {
						modifiedIcon.remove();
						hasChanges = true;
					}
				}
				// Item processed, remove from server map
				serverItemsMap.delete(path);
			}
		}
		
		// Add new nodes if any remain in the server map
		if (serverItemsMap.size > 0) {
			hasChanges = true;
			for (const [path, item] of serverItemsMap.entries()) {
				const li = document.createElement('li');
				let itemHtml = '';
				if (item.type === 'folder') {
					itemHtml = `
                        <span class="folder" data-path="${path}">
                            ${item.name}
                            <span class="folder-controls inline-block align-middle ml-2">
                                <i class="fas fa-search folder-search-icon text-base-content/40 hover:text-base-content/80 cursor-pointer" title="Search in this folder"></i>
                                <i class="fas fa-eraser folder-clear-icon text-base-content/40 hover:text-base-content/80 cursor-pointer ml-1" title="Clear selection in this folder"></i>
                            </span>
                        </span>`;
				} else { // file
					const fileInfo = item.info;
					const analysisIcon = fileInfo.has_analysis ? `<i class="fas fa-info-circle analysis-icon text-info hover:text-info-focus cursor-pointer align-middle mr-1" data-path="${fileInfo.path}" title="View Analysis"></i>` : '';
					const modifiedIcon = fileInfo.is_modified ? `<i class="fa-solid fa-triangle-exclamation text-warning align-middle ml-1" title="File has been modified since last analysis"></i>` : '';
					itemHtml = `
                        <div class="checkbox-wrapper">
                            <input type="checkbox" data-path="${fileInfo.path}" class="checkbox checkbox-xs checkbox-primary align-middle">
                        </div>
                        ${analysisIcon}
                        <span class="file align-middle" title="${fileInfo.path}">${fileInfo.name}</span>
                        ${modifiedIcon}`;
				}
				li.innerHTML = itemHtml;
				ul.appendChild(li);
			}
			
			// Re-sort all children in the UL
			const allLis = Array.from(ul.children);
			allLis.sort((a, b) => {
				const aIsFolder = !!a.querySelector('.folder');
				const bIsFolder = !!b.querySelector('.folder');
				const aName = (a.querySelector('.folder, .file')).textContent.trim();
				const bName = (b.querySelector('.folder, .file')).textContent.trim();
				
				if (aIsFolder && !bIsFolder) return -1; // Folders first
				if (!aIsFolder && bIsFolder) return 1;
				return aName.localeCompare(bName); // Then sort alphabetically
			});
			// Re-append in sorted order
			allLis.forEach(li => ul.appendChild(li));
		}
	}
	if (hasChanges) {
		console.log('File tree was updated due to filesystem changes.');
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
 */
export function startFileTreePolling() {
	stopFileTreePolling(); // Ensure no multiple intervals are running
	
	const pollInterval = 10000; // Poll every 5 seconds.
	
	fileTreeUpdateInterval = setInterval(async () => {
		const currentProject = getCurrentProject();
		if (!currentProject) {
			stopFileTreePolling();
			return;
		}
		
		const openFolderElements = document.querySelectorAll('#file-tree .folder.open');
		if (openFolderElements.length === 0) {
			return; // Nothing to check
		}
		const openFolderPaths = Array.from(openFolderElements).map(el => el.dataset.path);
		
		try {
			const updates = await postData({
				action: 'check_folder_updates',
				rootIndex: currentProject.rootIndex,
				projectPath: currentProject.path,
				openFolderPaths: JSON.stringify(openFolderPaths)
			});
			
			handleFileTreeUpdates(updates);
			
		} catch (error) {
			console.error('Error polling for file tree updates:', error);
		}
		
	}, pollInterval);
	console.log('File tree polling started.');
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
