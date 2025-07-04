// llm-php-helper/js/fileTree.js
import {showLoading, hideLoading, getParentPath, postData} from './utils.js';
import {getCurrentProject, getContentFooterPrompt, getLastSmartPrompt} from './state.js';

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
			// MODIFIED: Removed Bootstrap class, no replacement needed for ul.
			ul.style.display = 'none';
			ul.className = 'pl-4'; // Tailwind class for padding-left
			let content = '';
			response.folders.sort((a, b) => a.localeCompare(b));
			response.files.sort((a, b) => a.name.localeCompare(b.name));
			response.folders.forEach(folder => {
				const fullPath = `${path}/${folder}`;
				// MODIFIED: HTML structure for folder items.
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
				// MODIFIED: HTML structure for file items, using Tailwind classes for icons.
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
 */
export async function updateSelectedContent() {
	const checkedBoxes = document.querySelectorAll('#file-tree input[type="checkbox"]:checked');
	const selectedContentEl = document.getElementById('selected-content');
	if (checkedBoxes.length === 0) {
		selectedContentEl.value = '';
		return;
	}
	showLoading(`Loading ${checkedBoxes.length} file(s)...`);
	const contentFooterPrompt = getContentFooterPrompt();
	const userPrompt = getLastSmartPrompt();
	const requestPromises = Array.from(checkedBoxes).map(box => {
		const path = box.dataset.path;
		return postData({ action: 'get_file_content', rootIndex: getCurrentProject().rootIndex, path: path })
			.then(response => `${path}:\n\n${response.content}\n\n`)
			.catch(error => `/* --- ERROR loading ${path}: ${error.message || 'Unknown error'} --- */\n\n`);
	});
	try {
		const results = await Promise.all(requestPromises);
		selectedContentEl.value = results.join('') + contentFooterPrompt;
		
		const searchStr = '${userPrompt}';
		const lastIndex = selectedContentEl.value.lastIndexOf(searchStr);
		
		if (lastIndex !== -1) {
			selectedContentEl.value =
				selectedContentEl.value.substring(0, lastIndex) +
				userPrompt +
				selectedContentEl.value.substring(lastIndex + searchStr.length);
		}
		
	} catch (error) {
		console.error('Error updating content:', error);
		selectedContentEl.value = '/* --- An unexpected error occurred while loading file contents. --- */';
	} finally {
		hideLoading();
	}
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
