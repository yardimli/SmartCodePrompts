// SmartCodePrompts/js/ui_components.js
import {post_data} from './utils.js';
import {update_selected_content} from './file_tree.js';
import {show_alert} from './modal-alert.js';
// NEW: Import editor functions
import { get_editor_content, set_editor_theme } from './editor.js';

/**
 * Initializes the vertical and horizontal resizers for the layout.
 */
export function initialize_resizers() {
	const vertical_resizer = document.getElementById('vertical-resizer');
	const horizontal_resizer = document.getElementById('horizontal-resizer');
	const main_split_pane = document.getElementById('main-split-pane');
	const file_tree_pane = document.getElementById('file-tree-pane');
	const bottom_panel = document.getElementById('bottom-panel');
	
	if (vertical_resizer && main_split_pane && file_tree_pane) {
		vertical_resizer.addEventListener('mousedown', (e) => {
			e.preventDefault();
			document.body.style.cursor = 'col-resize';
			document.body.style.userSelect = 'none';
			
			const start_x = e.clientX;
			const start_width = file_tree_pane.offsetWidth;
			
			const do_drag = (e) => {
				const new_width = start_width + e.clientX - start_x;
				if (new_width >= 200 && new_width <= 600) {
					main_split_pane.style.gridTemplateColumns = `${new_width}px auto 1fr`;
				}
			};
			
			const stop_drag = () => {
				document.body.style.cursor = 'default';
				document.body.style.userSelect = 'auto';
				document.removeEventListener('mousemove', do_drag);
				document.removeEventListener('mouseup', stop_drag);
				
				// Save the final width to the backend
				const final_width = file_tree_pane.offsetWidth;
				post_data({action: 'save_file_tree_width', width: final_width})
					.catch(err => console.error('Failed to save file tree width:', err));
			};
			
			document.addEventListener('mousemove', do_drag);
			document.addEventListener('mouseup', stop_drag);
		});
	}
	
	if (horizontal_resizer && bottom_panel) {
		horizontal_resizer.addEventListener('mousedown', (e) => {
			e.preventDefault();
			document.body.style.cursor = 'row-resize';
			document.body.style.userSelect = 'none';
			
			const start_y = e.clientY;
			const start_height = bottom_panel.offsetHeight;
			
			const do_drag = (e) => {
				const new_height = start_height - (e.clientY - start_y);
				if (new_height >= 80 && new_height <= 300) {
					bottom_panel.style.height = `${new_height}px`;
				}
			};
			
			const stop_drag = () => {
				document.body.style.cursor = 'default';
				document.body.style.userSelect = 'auto';
				document.removeEventListener('mousemove', do_drag);
				document.removeEventListener('mouseup', stop_drag);
			};
			
			document.addEventListener('mousemove', do_drag);
			document.addEventListener('mouseup', stop_drag);
		});
	}
}

export function initialize_temperature_slider() {
	const slider = document.getElementById('temperature-slider');
	const value_display = document.getElementById('temperature-value');
	
	if (!slider || !value_display) return;
	
	const update_value = () => {
		value_display.textContent = parseFloat(slider.value).toFixed(2);
	};
	
	update_value();
	slider.addEventListener('input', update_value);
}

/**
 * Sets up various general-purpose UI event listeners.
 */
export function setup_ui_event_listeners() {
	// Listener for the copy prompt button.
	// Updated to get content from the Monaco Editor.
	document.getElementById('copy-prompt-button').addEventListener('click', function () {
		const text_to_copy = get_editor_content();
		
		if (!text_to_copy) {
			return;
		}
		
		// The navigator.clipboard API is secure in Electron and is the preferred method.
		navigator.clipboard.writeText(text_to_copy).then(() => {
			const button = this;
			const original_html = button.innerHTML;
			button.innerHTML = '<i class="bi bi-check-lg"></i> Copied!';
			button.disabled = true;
			setTimeout(() => {
				button.innerHTML = original_html;
				button.disabled = false;
			}, 2000);
		}).catch(err => {
			console.error('Failed to copy text: ', err);
			show_alert('Failed to copy text to clipboard.', 'Error');
		});
	});
	
	// Dark mode toggle listener.
	// MODIFIED: Also toggles the Monaco Editor theme.
	document.getElementById('toggle-mode').addEventListener('click', function () {
		const html = document.documentElement;
		const is_dark_mode = html.getAttribute('data-theme') === 'dark';
		const new_theme = is_dark_mode ? 'light' : 'dark';
		html.setAttribute('data-theme', new_theme);
		
		// NEW: Update editor theme
		set_editor_theme(!is_dark_mode);
		
		const highlight_theme_link = document.getElementById('highlight-js-theme');
		
		if (new_theme === 'dark') {
			this.querySelector('i').classList = 'bi-moon';
			if (highlight_theme_link) {
				highlight_theme_link.href = './vendor/highlight.js/styles/atom-one-dark.min.css';
			}
		} else { // new_theme === 'light'
			this.querySelector('i').classList = 'bi-sun';
			if (highlight_theme_link) {
				highlight_theme_link.href = './vendor/highlight.js/styles/atom-one-light.min.css';
			}
		}
		
		post_data({action: 'set_dark_mode', is_dark_mode: !is_dark_mode});
	});
	
	// Right sidebar toggle listener.
	document.getElementById('toggle-right-sidebar').addEventListener('click', function () {
		const app_container = document.getElementById('app-container');
		const is_collapsed = app_container.classList.toggle('right-sidebar-collapsed');
		
		// Persist the state to the server
		post_data({action: 'set_right_sidebar_collapsed', is_collapsed: is_collapsed})
			.catch(err => console.error('Failed to save sidebar state:', err));
	});
	
	// Global keyboard shortcuts
	document.addEventListener('keydown', (e) => {
		// Ctrl+F to open project search
		if (e.ctrlKey && e.key.toLowerCase() === 'f') {
			e.preventDefault();
			// This button's click handler is in modal-search.js and handles all setup.
			document.getElementById('project-search-button').click();
		}
	});
}
