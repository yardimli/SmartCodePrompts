// SmartCodePrompts/js/modal-search.js
import {show_loading, hide_loading, post_data} from './utils.js';
import {get_current_project, save_current_project_state} from './state.js';
import {ensure_file_is_visible, update_selected_content} from './file_tree.js';
import {show_alert} from './modal-alert.js';
import { openFileInTab } from './editor.js';

let search_modal = null;
let current_project_search_results = [];
let current_search_matches = [];
let current_search_match_index = -1;
let last_search_term = '';

/**
 * Initializes the search modal element reference.
 */
export function initialize_search_modal () {
	search_modal = document.getElementById('search_modal');
};

/**
 * Opens a file from the search results in a new editor tab.
 * @param {string} filePath The path of the file to open.
 */
async function open_file_from_search(filePath) {
	search_modal.close();
	show_loading(`Opening ${filePath}...`);
	try {
		const current_project = get_current_project();
		if (!current_project) {
			throw new Error('No project is currently selected.');
		}
		const data = await post_data({
			action: 'get_file_for_editor',
			project_path: current_project.path,
			path: filePath
		});
		
		const currentContent = data.currentContent ?? `/* File not found or is empty: ${filePath} */`;
		
		// Pass null for originalContent to ensure a normal (non-diff) tab is opened.
		openFileInTab(filePath, currentContent, null);
		
	} catch (error) {
		console.error(`Error opening file ${filePath}:`, error);
		show_alert(`Error opening file ${filePath}: ${error.message}`, 'Error');
	} finally {
		hide_loading();
	}
}

function escape_html (str) {
	if (typeof str !== 'string') {
		return '';
	}
	return str.replace(/</g, '<')
		.replace(/>/g, '>');
}

function highlight_current_match () {
	const preview_el = document.getElementById('search-preview-content');
	// The search matches are the <mark> tags we inserted.
	const matches = preview_el.getElementsByClassName('search-match');
	
	if (!matches.length || current_search_match_index < 0) {
		return;
	}
	
	// Remove 'current' class from the previously active match.
	// Using a more specific class name to avoid conflicts.
	const previous_match = preview_el.querySelector('.current-search-match');
	if (previous_match) {
		previous_match.classList.remove('current-search-match');
	}
	
	const current_match_el = matches[current_search_match_index];
	if (current_match_el) {
		// Add 'current' class to the new active match for distinct styling.
		current_match_el.classList.add('current-search-match');
		
		// Scroll the element into view. This is much simpler than calculating scroll position.
		current_match_el.scrollIntoView({
			behavior: 'auto', // Use 'auto' for faster response than 'smooth'
			block: 'center'
		});
	}
	
	document.getElementById('search-preview-matches').textContent = `${current_search_match_index + 1} of ${matches.length}`;
}


async function show_search_preview (file_path, search_term) {
	const title_el = document.getElementById('search-preview-title');
	const content_el = document.getElementById('search-preview-content');
	const nav_el = document.getElementById('search-preview-nav');
	
	// Reset state for the new file preview.
	title_el.textContent = `Loading ${file_path}...`;
	content_el.textContent = 'Loading...';
	content_el.className = 'font-mono text-xs p-2 block'; // Reset classes
	nav_el.classList.add('hidden');
	current_search_matches = [];
	current_search_match_index = -1;
	
	try {
		const current_project = get_current_project();
		const data = await post_data({
			action: 'get_file_content',
			project_path: current_project.path,
			path: file_path
		});
		
		const raw_content = data.content || '';
		// Normalize newlines to ensure regex indices are correct. Do not escape HTML here.
		const file_content = raw_content.replace(/\r\n/g, '\n');
		
		const search_regex = new RegExp(search_term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
		
		let match;
		while ((match = search_regex.exec(file_content)) !== null) {
			current_search_matches.push(match);
		}
		
		// If there are no matches, we can take a simple path.
		if (current_search_matches.length === 0) {
			content_el.textContent = file_content; // Let hljs handle content
			if (window.hljs) {
				content_el.removeAttribute('data-highlighted');
				hljs.highlightElement(content_el);
			}
			document.getElementById('search-preview-matches').textContent = '0 matches';
		} else {
			// With matches, we use a placeholder strategy to combine highlighting.
			// 1. Replace matches in the raw text with unique, safe placeholders.
			const placeholders = [];
			let content_with_placeholders = '';
			let last_index = 0;
			
			current_search_matches.forEach((m, i) => {
				const placeholder = `__SCPSM${i}__`; // A unique, simple placeholder
				placeholders.push({placeholder: placeholder, text: m[0]});
				
				content_with_placeholders += file_content.substring(last_index, m.index);
				content_with_placeholders += placeholder;
				last_index = m.index + m[0].length;
			});
			content_with_placeholders += file_content.substring(last_index);
			
			// 2. Apply syntax highlighting to the text that now contains the placeholders.
			let highlighted_html = '';
			if (window.hljs) {
				try {
					// highlightAuto will escape the content and our placeholders.
					highlighted_html = hljs.highlightAuto(content_with_placeholders).value;
				} catch (e) {
					console.error('Error during syntax highlighting:', e);
					// Fallback to just escaping the text if highlighting fails.
					highlighted_html = escape_html(content_with_placeholders);
				}
			} else {
				// If highlight.js is not available, just escape the content.
				highlighted_html = escape_html(content_with_placeholders);
			}
			
			// 3. Replace the placeholders in the now-highlighted HTML with the final <mark> tags.
			placeholders.forEach(p => {
				const mark_tag = `<mark class="search-match">${escape_html(p.text)}</mark>`;
				// The placeholder is treated as text, so it won't contain special HTML characters.
				// A simple global replace is sufficient.
				highlighted_html = highlighted_html.replace(new RegExp(p.placeholder, 'g'), mark_tag);
			});
			
			// 4. Set the final, combined HTML to the content element.
			content_el.innerHTML = highlighted_html;
			// Ensure hljs can re-highlight this element in the future if needed.
			content_el.removeAttribute('data-highlighted');
		}
		
		title_el.textContent = file_path;
		
		if (current_search_matches.length > 0) {
			nav_el.classList.remove('hidden');
			current_search_match_index = 0;
			highlight_current_match();
		}
		
	} catch (error) {
		title_el.textContent = `Error loading ${file_path}`;
		content_el.textContent = `Error: ${error.message}`;
	}
}

/**
 * Sets up event listeners for the project-wide search modal.
 */
export function setup_search_modal_listeners () {
	document.getElementById('project-search-button').addEventListener('click', (e) => {
		e.preventDefault();
		
		const search_input = document.getElementById('search_term_input');
		search_input.value = last_search_term;
		
		// Reset the rest of the UI, but keep the search term in the input.
		document.getElementById('search-results-list').innerHTML = '<p class="text-base-content/60 text-center font-sans text-sm">Enter a search term and click "Find".</p>';
		document.getElementById('search-preview-title').textContent = 'Select a file to preview';
		document.getElementById('search-preview-content').textContent = '';
		document.getElementById('search-preview-nav').classList.add('hidden');
		document.getElementById('check_matching_files_button').disabled = true;
		current_project_search_results = [];
		current_search_matches = [];
		current_search_match_index = -1;
		
		search_modal.showModal();
		search_input.focus();
		search_input.select(); // Select the text for easy replacement.
		
		if (last_search_term.trim()) {
			perform_search();
		}
	});
	
	const perform_search = async () => {
		const search_term = document.getElementById('search_term_input').value.trim();
		const results_list = document.getElementById('search-results-list');
		const check_button = document.getElementById('check_matching_files_button');
		
		document.getElementById('search-preview-title').textContent = 'Select a file to preview';
		document.getElementById('search-preview-content').textContent = '';
		document.getElementById('search-preview-nav').classList.add('hidden');
		
		if (!search_term) {
			results_list.innerHTML = '<p class="text-error text-center">Please enter a search term.</p>';
			check_button.disabled = true;
			return;
		}
		
		last_search_term = search_term;
		
		results_list.innerHTML = '<div class="text-center"><span class="loading loading-spinner"></span> Searching...</div>';
		check_button.disabled = true;
		
		try {
			const current_project = get_current_project();
			const response = await post_data({
				action: 'search_files',
				folder_path: '.',
				search_term: search_term,
				project_path: current_project.path
			});
			
			current_project_search_results = response.matching_files || [];
			
			if (current_project_search_results.length > 0) {
				results_list.innerHTML = current_project_search_results.map(file => `
                    <div class="p-1.5 hover:bg-base-300 rounded cursor-pointer search-result-item" data-path="${file.path}" title="${file.path}">
                        <span class="badge badge-neutral badge-sm mr-2">${file.match_count}</span>
                        <span class="truncate">${file.path}</span>
                    </div>
                `).join('');
				check_button.disabled = false;
			} else {
				results_list.innerHTML = `<p class="text-base-content/80 text-center">No files found containing "${escape_html(search_term)}".</p>`;
			}
		} catch (error) {
			results_list.innerHTML = `<p class="text-error text-center">Search failed: ${error.message || 'Unknown error'}</p>`;
		}
	};
	
	document.getElementById('search_term_input').addEventListener('keypress', e => {
		if (e.key === 'Enter') {
			e.preventDefault();
			perform_search();
		}
	});
	
	document.getElementById('perform_search_button').addEventListener('click', perform_search);
	
	document.getElementById('search-results-list').addEventListener('click', e => {
		const item = e.target.closest('.search-result-item');
		if (item) {
			const file_path = item.dataset.path;
			const search_term = document.getElementById('search_term_input').value.trim();
			
			document.querySelectorAll('.search-result-item').forEach(el => el.classList.remove('bg-primary/50'));
			item.classList.add('bg-primary/50');
			
			if (file_path && search_term) {
				show_search_preview(file_path, search_term);
			}
		}
	});
	
	document.getElementById('search-results-list').addEventListener('dblclick', e => {
		const item = e.target.closest('.search-result-item');
		if (item) {
			const file_path = item.dataset.path;
			if (file_path) {
				open_file_from_search(file_path);
			}
		}
	});
	
	document.getElementById('search-next-match-btn').addEventListener('click', () => {
		if (current_search_matches.length > 0) {
			current_search_match_index = (current_search_match_index + 1) % current_search_matches.length;
			highlight_current_match();
		}
	});
	
	document.getElementById('search-prev-match-btn').addEventListener('click', () => {
		if (current_search_matches.length > 0) {
			current_search_match_index = (current_search_match_index - 1 + current_search_matches.length) % current_search_matches.length;
			highlight_current_match();
		}
	});
	
	document.getElementById('check_matching_files_button').addEventListener('click', async function () {
		if (current_project_search_results.length === 0) return;
		
		search_modal.close();
		show_loading(`Selecting ${current_project_search_results.length} file(s)...`);
		
		const files_to_check = current_project_search_results.map(f => f.path);
		
		try {
			let successful_checks = 0;
			for (const file_path of files_to_check) {
				const is_visible = await ensure_file_is_visible(file_path);
				if (is_visible) {
					const checkbox = document.querySelector(`#file-tree input[type="checkbox"][data-path="${file_path}"]`);
					if (checkbox && !checkbox.checked) {
						checkbox.checked = true;
						successful_checks++;
					}
				}
			}
			if (successful_checks > 0) {
				await update_selected_content();
				save_current_project_state();
			}
			show_alert(`Selected ${successful_checks} new file(s) from search results.`);
		} catch (error) {
			show_alert(`An error occurred while selecting files: ${error.message || 'Unknown error'}`, 'Error');
		} finally {
			hide_loading();
		}
	});
};
