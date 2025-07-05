// SmartCodePrompts/js/ui_components.js
import {post_data} from './utils.js';
import {update_selected_content} from './file_tree.js';

/**
 * Updates the text of the compress extensions dropdown button based on the number of selected extensions.
 */
function update_compress_extensions_button() {
	const menu_element = document.getElementById('compress-extensions-dropdown-menu');
	const button_label = document.getElementById('compress-extensions-button');
	if (!menu_element || !button_label) return;
	
	const count = menu_element.querySelectorAll('.compress-extension-checkbox:checked').length;
	
	if (count === 0) {
		button_label.textContent = 'Select extensions...';
	} else {
		button_label.textContent = `${count} extension(s) selected`;
	}
}

/**
 * Populates the compress extensions dropdown with checkboxes.
 * @param {string} allowed_extensions_json - JSON string array of all possible extensions.
 * @param {string} compressed_extensions_json - JSON string array of extensions to be selected.
 */
export function initialize_compress_extensions_dropdown(allowed_extensions_json, compressed_extensions_json) {
	const menu_element = document.getElementById('compress-extensions-dropdown-menu');
	if (!menu_element) return;
	
	try {
		const allowed = JSON.parse(allowed_extensions_json);
		const compressed = new Set(JSON.parse(compressed_extensions_json));
		
		if (!Array.isArray(allowed) || allowed.length === 0) {
			menu_element.innerHTML = '<li class="w-full"><a>No extensions configured.</a></li>';
			return;
		}
		
		allowed.sort();
		let content = '';
		for (const ext of allowed) {
			const is_selected = compressed.has(ext);
			content += `
                <li class="w-full">
                    <label class="label cursor-pointer justify-start gap-3">
                        <input type="checkbox" value="${ext}" ${is_selected ? 'checked' : ''} class="checkbox checkbox-primary checkbox-sm compress-extension-checkbox" />
                        <span class="label-text">.${ext}</span>
                    </label>
                </li>`;
		}
		menu_element.innerHTML = content;
		update_compress_extensions_button();
	} catch (e) {
		console.error("Failed to parse extension settings:", e);
		menu_element.innerHTML = '<li><a>Error loading settings.</a></li>';
	}
}

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
			document.body.style.user_select = 'none';
			
			const start_x = e.clientX;
			const start_width = file_tree_pane.offset_width;
			
			const do_drag = (e) => {
				const new_width = start_width + e.clientX - start_x;
				if (new_width >= 200 && new_width <= 600) {
					main_split_pane.style.grid_template_columns = `${new_width}px auto 1fr`;
				}
			};
			
			const stop_drag = () => {
				document.body.style.cursor = 'default';
				document.body.style.user_select = 'auto';
				document.removeEventListener('mousemove', do_drag);
				document.removeEventListener('mouseup', stop_drag);
			};
			
			document.addEventListener('mousemove', do_drag);
			document.addEventListener('mouseup', stop_drag);
		});
	}
	
	if (horizontal_resizer && bottom_panel) {
		horizontal_resizer.addEventListener('mousedown', (e) => {
			e.preventDefault();
			document.body.style.cursor = 'row-resize';
			document.body.style.user_select = 'none';
			
			const start_y = e.clientY;
			const start_height = bottom_panel.offset_height;
			
			const do_drag = (e) => {
				const new_height = start_height - (e.clientY - start_y);
				if (new_height >= 80 && new_height <= 300) {
					bottom_panel.style.height = `${new_height}px`;
				}
			};
			
			const stop_drag = () => {
				document.body.style.cursor = 'default';
				document.body.style.user_select = 'auto';
				document.removeEventListener('mousemove', do_drag);
				document.removeEventListener('mouseup', stop_drag);
			};
			
			document.addEventListener('mousemove', do_drag);
			document.addEventListener('mouseup', stop_drag);
		});
	}
}

/**
 * Initializes the temperature slider to display its current value.
 */
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
	// Listener for the compress extensions dropdown menu.
	document.getElementById('compress-extensions-dropdown-menu').addEventListener('change', (e) => {
		if (!e.target.classList.contains('compress-extension-checkbox')) {
			return;
		}
		update_compress_extensions_button();
		
		const checked_checkboxes = document.querySelectorAll('#compress-extensions-dropdown-menu .compress-extension-checkbox:checked');
		const selected_extensions = Array.from(checked_checkboxes).map(checkbox => checkbox.value);
		
		post_data({
			action: 'save_compress_extensions',
			extensions: JSON.stringify(selected_extensions)
		}).then(() => {
			update_selected_content();
		}).catch(err => {
			console.error("Failed to save compress extensions setting:", err);
			alert("Could not save compression setting. See console for details.");
		});
	});
	
	// Listeners to manually control the compress extensions dropdown toggle.
	const compress_dropdown = document.getElementById('compress-extensions-dropdown');
	const compress_button = document.getElementById('compress-extensions-button');
	
	if (compress_dropdown && compress_button) {
		compress_button.addEventListener('click', (e) => {
			e.stopPropagation();
			compress_dropdown.classList.toggle('dropdown-open');
		});
	}
	
	// Listener to close the dropdown when clicking anywhere else on the page.
	document.addEventListener('click', () => {
		if (compress_dropdown) {
			compress_dropdown.classList.remove('dropdown-open');
		}
	});
	
	// Listener for the copy prompt button.
	document.getElementById('copy-prompt-button').addEventListener('click', function () {
		const content_textarea = document.getElementById('selected-content');
		const text_to_copy = content_textarea.value;
		
		if (!text_to_copy) {
			return;
		}
		
		if (navigator.clipboard && window.isSecureContext) {
			navigator.clipboard.writeText(text_to_copy).then(() => {
				const button = this;
				const original_html = button.innerHTML;
				button.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
				button.disabled = true;
				setTimeout(() => {
					button.innerHTML = original_html;
					button.disabled = false;
				}, 2000);
			}).catch(err => {
				console.error('Failed to copy text: ', err);
				alert('Failed to copy text to clipboard.');
			});
		} else {
			try {
				content_textarea.select();
				document.execCommand('copy');
				const button = this;
				const original_html = button.innerHTML;
				button.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
				button.disabled = true;
				setTimeout(() => {
					button.innerHTML = original_html;
					button.disabled = false;
				}, 2000);
			} catch (err) {
				console.error('Fallback copy failed: ', err);
				alert('Failed to copy text to clipboard.');
			}
		}
	});
	
	// Dark mode toggle listener.
	document.getElementById('toggle-mode').addEventListener('click', function () {
		const html = document.documentElement;
		const is_dark_mode = html.getAttribute('data-theme') === 'dark';
		const new_theme = is_dark_mode ? 'light' : 'dark';
		html.setAttribute('data-theme', new_theme);
		
		if (new_theme === 'dark') {
			this.querySelector('i').classList = 'bi-moon';
		} else { // new_theme === 'light'
			this.querySelector('i').classList = 'bi-sun';
		}
		
		post_data({action: 'set_dark_mode', is_dark_mode: !is_dark_mode});
	});
	
	// NEW: Right sidebar toggle listener.
	document.getElementById('toggle-right-sidebar').addEventListener('click', function () {
		const app_container = document.getElementById('app-container');
		const is_collapsed = app_container.classList.toggle('right-sidebar-collapsed');
		
		// Persist the state to the server
		post_data({action: 'set_right_sidebar_collapsed', is_collapsed: is_collapsed})
			.catch(err => console.error('Failed to save sidebar state:', err));
	});
}
