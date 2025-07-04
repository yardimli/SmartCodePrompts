// SmartCodePrompts/js/uiComponents.js
import {postData} from './utils.js';
import {updateSelectedContent} from './fileTree.js';

/**
 * Updates the text of the compress extensions dropdown button based on the number of selected extensions.
 */
function updateCompressExtensionsButton() {
	const menuElement = document.getElementById('compress-extensions-dropdown-menu');
	const buttonLabel = document.getElementById('compress-extensions-button');
	if (!menuElement || !buttonLabel) return;
	
	const count = menuElement.querySelectorAll('.compress-extension-checkbox:checked').length;
	
	if (count === 0) {
		buttonLabel.textContent = 'Select extensions...';
	} else {
		buttonLabel.textContent = `${count} extension(s) selected`;
	}
}

/**
 * Populates the compress extensions dropdown with checkboxes.
 * @param {string} allowedExtensionsJson - JSON string array of all possible extensions.
 * @param {string} compressedExtensionsJson - JSON string array of extensions to be selected.
 */
export function initializeCompressExtensionsDropdown(allowedExtensionsJson, compressedExtensionsJson) {
	const menuElement = document.getElementById('compress-extensions-dropdown-menu');
	if (!menuElement) return;
	
	try {
		const allowed = JSON.parse(allowedExtensionsJson);
		const compressed = new Set(JSON.parse(compressedExtensionsJson));
		
		if (!Array.isArray(allowed) || allowed.length === 0) {
			menuElement.innerHTML = '<li class="w-full"><a>No extensions configured.</a></li>';
			return;
		}
		
		allowed.sort();
		let content = '';
		for (const ext of allowed) {
			const isSelected = compressed.has(ext);
			content += `
                <li class="w-full">
                    <label class="label cursor-pointer justify-start gap-3">
                        <input type="checkbox" value="${ext}" ${isSelected ? 'checked' : ''} class="checkbox checkbox-primary checkbox-sm compress-extension-checkbox" />
                        <span class="label-text">.${ext}</span>
                    </label>
                </li>`;
		}
		menuElement.innerHTML = content;
		updateCompressExtensionsButton();
	} catch (e) {
		console.error("Failed to parse extension settings:", e);
		menuElement.innerHTML = '<li><a>Error loading settings.</a></li>';
	}
}

/**
 * Initializes the vertical and horizontal resizers for the layout.
 */
export function initializeResizers() {
	const verticalResizer = document.getElementById('vertical-resizer');
	const horizontalResizer = document.getElementById('horizontal-resizer');
	const mainSplitPane = document.getElementById('main-split-pane');
	const fileTreePane = document.getElementById('file-tree-pane');
	const bottomPanel = document.getElementById('bottom-panel');
	
	if (verticalResizer && mainSplitPane && fileTreePane) {
		verticalResizer.addEventListener('mousedown', (e) => {
			e.preventDefault();
			document.body.style.cursor = 'col-resize';
			document.body.style.userSelect = 'none';
			
			const startX = e.clientX;
			const startWidth = fileTreePane.offsetWidth;
			
			const doDrag = (e) => {
				const newWidth = startWidth + e.clientX - startX;
				if (newWidth >= 200 && newWidth <= 600) {
					mainSplitPane.style.gridTemplateColumns = `${newWidth}px auto 1fr`;
				}
			};
			
			const stopDrag = () => {
				document.body.style.cursor = 'default';
				document.body.style.userSelect = 'auto';
				document.removeEventListener('mousemove', doDrag);
				document.removeEventListener('mouseup', stopDrag);
			};
			
			document.addEventListener('mousemove', doDrag);
			document.addEventListener('mouseup', stopDrag);
		});
	}
	
	if (horizontalResizer && bottomPanel) {
		horizontalResizer.addEventListener('mousedown', (e) => {
			e.preventDefault();
			document.body.style.cursor = 'row-resize';
			document.body.style.userSelect = 'none';
			
			const startY = e.clientY;
			const startHeight = bottomPanel.offsetHeight;
			
			const doDrag = (e) => {
				const newHeight = startHeight - (e.clientY - startY);
				if (newHeight >= 80 && newHeight <= 300) {
					bottomPanel.style.height = `${newHeight}px`;
				}
			};
			
			const stopDrag = () => {
				document.body.style.cursor = 'default';
				document.body.style.userSelect = 'auto';
				document.removeEventListener('mousemove', doDrag);
				document.removeEventListener('mouseup', stopDrag);
			};
			
			document.addEventListener('mousemove', doDrag);
			document.addEventListener('mouseup', stopDrag);
		});
	}
}

/**
 * Initializes the temperature slider to display its current value.
 */
export function initializeTemperatureSlider() {
	const slider = document.getElementById('temperature-slider');
	const valueDisplay = document.getElementById('temperature-value');
	
	if (!slider || !valueDisplay) return;
	
	const updateValue = () => {
		valueDisplay.textContent = parseFloat(slider.value).toFixed(2);
	};
	
	updateValue();
	slider.addEventListener('input', updateValue);
}

/**
 * Sets up various general-purpose UI event listeners.
 */
export function setupUIEventListeners() {
	// Listener for the compress extensions dropdown menu.
	document.getElementById('compress-extensions-dropdown-menu').addEventListener('change', (e) => {
		if (!e.target.classList.contains('compress-extension-checkbox')) {
			return;
		}
		updateCompressExtensionsButton();
		
		const checkedCheckboxes = document.querySelectorAll('#compress-extensions-dropdown-menu .compress-extension-checkbox:checked');
		const selectedExtensions = Array.from(checkedCheckboxes).map(checkbox => checkbox.value);
		
		postData({
			action: 'save_compress_extensions',
			extensions: JSON.stringify(selectedExtensions)
		}).then(() => {
			updateSelectedContent();
		}).catch(err => {
			console.error("Failed to save compress extensions setting:", err);
			alert("Could not save compression setting. See console for details.");
		});
	});
	
	// Listeners to manually control the compress extensions dropdown toggle.
	const compressDropdown = document.getElementById('compress-extensions-dropdown');
	const compressButton = document.getElementById('compress-extensions-button');
	
	if (compressDropdown && compressButton) {
		compressButton.addEventListener('click', (e) => {
			e.stopPropagation();
			compressDropdown.classList.toggle('dropdown-open');
		});
	}
	
	// Listener to close the dropdown when clicking anywhere else on the page.
	document.addEventListener('click', () => {
		if (compressDropdown) {
			compressDropdown.classList.remove('dropdown-open');
		}
	});
	
	// Listener for the copy prompt button.
	document.getElementById('copy-prompt-button').addEventListener('click', function () {
		const contentTextarea = document.getElementById('selected-content');
		const textToCopy = contentTextarea.value;
		
		if (!textToCopy) {
			return;
		}
		
		if (navigator.clipboard && window.isSecureContext) {
			navigator.clipboard.writeText(textToCopy).then(() => {
				const button = this;
				const originalHtml = button.innerHTML;
				button.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
				button.disabled = true;
				setTimeout(() => {
					button.innerHTML = originalHtml;
					button.disabled = false;
				}, 2000);
			}).catch(err => {
				console.error('Failed to copy text: ', err);
				alert('Failed to copy text to clipboard.');
			});
		} else {
			try {
				contentTextarea.select();
				document.execCommand('copy');
				const button = this;
				const originalHtml = button.innerHTML;
				button.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
				button.disabled = true;
				setTimeout(() => {
					button.innerHTML = originalHtml;
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
		const isDarkMode = html.getAttribute('data-theme') === 'dark';
		const newTheme = isDarkMode ? 'light' : 'dark';
		html.setAttribute('data-theme', newTheme);
		
		if (newTheme === 'dark') {
			this.querySelector('i').classList = 'bi-moon';
		} else { // newTheme === 'light'
			this.querySelector('i').classList = 'bi-sun';
		}
		
		postData({action: 'set_dark_mode', isDarkMode: !isDarkMode});
	});
}
