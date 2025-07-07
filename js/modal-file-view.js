// SmartCodePrompts/js/modal-file-view.js
import {post_data} from './utils.js';
import {get_current_project} from './state.js';

// MODIFIED: Add more variables for modal elements and search state.
let file_view_modal = null;
let file_view_content_el = null;
let file_view_search_input = null;
let file_view_search_btn = null;
let file_view_nav_el = null;
let file_view_matches_el = null;
let file_view_prev_btn = null;
let file_view_next_btn = null;

// NEW: State for the search within the file view modal.
let current_file_content = ''; // Store raw content for re-searching.
let current_matches = [];
let current_match_index = -1;

// NEW: Helper function to escape HTML, similar to the one in modal-search.js.
function escape_html (str) {
	if (typeof str !== 'string') {
		return '';
	}
	return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// NEW: Highlights the current search match and scrolls it into view.
function highlight_current_match () {
	// The search matches are the <mark> tags we inserted.
	const matches = file_view_content_el.getElementsByClassName('search-match');
	
	if (!matches.length || current_match_index < 0) {
		return;
	}
	
	// Remove 'current' class from the previously active match.
	const previous_match = file_view_content_el.querySelector('.current-search-match');
	if (previous_match) {
		previous_match.classList.remove('current-search-match');
	}
	
	const current_match_el = matches[current_match_index];
	if (current_match_el) {
		// Add 'current' class to the new active match for distinct styling.
		current_match_el.classList.add('current-search-match');
		
		// Scroll the element into view.
		current_match_el.scrollIntoView({
			behavior: 'auto',
			block: 'center'
		});
	}
	
	file_view_matches_el.textContent = `${current_match_index + 1} of ${matches.length}`;
}

// NEW: Performs the search and applies highlighting.
function perform_search () {
	const search_term = file_view_search_input.value;
	
	// If search term is cleared, restore original syntax-highlighted content.
	if (!search_term) {
		file_view_content_el.textContent = current_file_content;
		if (window.hljs) {
			file_view_content_el.removeAttribute('data-highlighted');
			hljs.highlightElement(file_view_content_el);
		}
		file_view_nav_el.classList.add('hidden');
		current_matches = [];
		current_match_index = -1;
		return;
	}
	
	const search_regex = new RegExp(search_term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
	
	current_matches = [];
	let match;
	while ((match = search_regex.exec(current_file_content)) !== null) {
		current_matches.push(match);
	}
	
	// If there are no matches, we don't need to change the display.
	// Just show a "0 matches" message.
	if (current_matches.length === 0) {
		// Restore original content if a previous search had results.
		file_view_content_el.textContent = current_file_content;
		if (window.hljs) {
			file_view_content_el.removeAttribute('data-highlighted');
			hljs.highlightElement(file_view_content_el);
		}
		file_view_nav_el.classList.remove('hidden');
		file_view_matches_el.textContent = '0 matches';
		return;
	}
	
	// With matches, use the placeholder strategy to combine highlighting.
	// 1. Replace matches in the raw text with unique, safe placeholders.
	const placeholders = [];
	let content_with_placeholders = '';
	let last_index = 0;
	
	current_matches.forEach((m, i) => {
		const placeholder = `__SCPFV${i}__`; // A unique, simple placeholder for File View
		placeholders.push({placeholder: placeholder, text: m[0]});
		
		content_with_placeholders += current_file_content.substring(last_index, m.index);
		content_with_placeholders += placeholder;
		last_index = m.index + m[0].length;
	});
	content_with_placeholders += current_file_content.substring(last_index);
	
	// 2. Apply syntax highlighting to the text that now contains the placeholders.
	let highlighted_html = '';
	if (window.hljs) {
		try {
			highlighted_html = hljs.highlightAuto(content_with_placeholders).value;
		} catch (e) {
			console.error('Error during syntax highlighting:', e);
			highlighted_html = escape_html(content_with_placeholders);
		}
	} else {
		highlighted_html = escape_html(content_with_placeholders);
	}
	
	// 3. Replace the placeholders in the now-highlighted HTML with the final <mark> tags.
	placeholders.forEach(p => {
		const mark_tag = `<mark class="search-match">${escape_html(p.text)}</mark>`;
		highlighted_html = highlighted_html.replace(new RegExp(p.placeholder, 'g'), mark_tag);
	});
	
	// 4. Set the final, combined HTML to the content element.
	file_view_content_el.innerHTML = highlighted_html;
	file_view_content_el.removeAttribute('data-highlighted');
	
	// 5. Update navigation and highlight the first match.
	file_view_nav_el.classList.remove('hidden');
	current_match_index = 0;
	highlight_current_match();
}

/**
 * Initializes the file view modal element reference and sets up search listeners.
 */
export function initialize_file_view_modal () {
	file_view_modal = document.getElementById('file_view_modal');
	// NEW: Get all the new elements.
	file_view_content_el = document.getElementById('file-view-modal-content');
	file_view_search_input = document.getElementById('file-view-search-input');
	file_view_search_btn = document.getElementById('file-view-search-btn');
	file_view_nav_el = document.getElementById('file-view-search-nav');
	file_view_matches_el = document.getElementById('file-view-search-matches');
	file_view_prev_btn = document.getElementById('file-view-prev-match-btn');
	file_view_next_btn = document.getElementById('file-view-next-match-btn');
	
	// NEW: Setup event listeners for the search functionality.
	if (file_view_search_btn) {
		file_view_search_btn.addEventListener('click', perform_search);
	}
	if (file_view_search_input) {
		file_view_search_input.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				perform_search();
			}
		});
	}
	if (file_view_next_btn) {
		file_view_next_btn.addEventListener('click', () => {
			if (current_matches.length > 0) {
				current_match_index = (current_match_index + 1) % current_matches.length;
				highlight_current_match();
			}
		});
	}
	if (file_view_prev_btn) {
		file_view_prev_btn.addEventListener('click', () => {
			if (current_matches.length > 0) {
				current_match_index = (current_match_index - 1 + current_matches.length) % current_matches.length;
				highlight_current_match();
			}
		});
	}
};

/**
 * Opens a modal to display the file's content in a syntax-highlighted view.
 * @param {HTMLElement} target - The file-entry element that was clicked.
 */
export async function handle_file_name_click (target) {
	if (!file_view_modal) return;
	const file_path = target.dataset.path;
	const title_el = document.getElementById('file-view-modal-title');
	
	// MODIFIED: Reset search state and UI when opening a new file.
	title_el.textContent = `Content of ${file_path}`;
	file_view_content_el.textContent = 'Loading file content...';
	file_view_search_input.value = '';
	file_view_nav_el.classList.add('hidden');
	current_file_content = '';
	current_matches = [];
	current_match_index = -1;
	
	file_view_modal.showModal();
	
	try {
		const current_project = get_current_project();
		const data = await post_data({
			action: 'get_file_content',
			project_path: current_project.path,
			path: file_path
		});
		
		// MODIFIED: Store raw content and display it with syntax highlighting.
		current_file_content = data.content || 'File is empty or could not be loaded.';
		file_view_content_el.textContent = current_file_content;
		
		// Apply syntax highlighting if highlight.js is available.
		if (window.hljs) {
			file_view_content_el.removeAttribute('data-highlighted');
			hljs.highlightElement(file_view_content_el);
		}
		
	} catch (error) {
		current_file_content = `Error fetching file content: ${error.message}`;
		file_view_content_el.textContent = current_file_content;
	}
};
