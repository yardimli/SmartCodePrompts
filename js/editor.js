// SmartCodePrompts/js/editor.js

let editor = null;

/**
 * Initializes the Monaco Editor in the designated container.
 * This function should be called once the DOM is ready.
 * @param {boolean} is_dark_mode - Whether to initialize in dark mode.
 * @returns {Promise<void>} A promise that resolves when the editor is initialized.
 */
export function initialize_editor(is_dark_mode) {
	return new Promise((resolve) => {
		// The Monaco loader is loaded globally in index.html
		require(['vs/editor/editor.main'], () => {
			const editor_container = document.getElementById('monaco-editor-container');
			if (!editor_container) {
				console.error('Monaco editor container not found!');
				resolve();
				return;
			}
			
			editor = monaco.editor.create(editor_container, {
				value: '// Select files from the left to build a prompt.',
				language: 'plaintext',
				theme: is_dark_mode ? 'vs-dark' : 'vs',
				readOnly: true,
				wordWrap: 'on',
				fontFamily: 'monospace',
				fontSize: 13,
				minimap: {
					enabled: false
				},
				automaticLayout: true, // This is crucial for resizable containers
				scrollBeyondLastLine: false,
				contextmenu: false, // Use the app's context menu
			});
			
			console.log('Monaco editor initialized.');
			resolve();
		});
	});
}

/**
 * Sets the content of the Monaco Editor.
 * @param {string} content - The new content to display.
 */
export function set_editor_content(content) {
	if (editor) {
		editor.setValue(content);
	}
}

/**
 * Gets the current content from the Monaco Editor.
 * @returns {string} The editor's content.
 */
export function get_editor_content() {
	if (editor) {
		return editor.getValue();
	}
	return '';
}

/**
 * Toggles the theme of the Monaco Editor.
 * @param {boolean} is_dark_mode - True for dark mode, false for light mode.
 */
export function set_editor_theme(is_dark_mode) {
	if (editor) {
		monaco.editor.setTheme(is_dark_mode ? 'vs-dark' : 'vs');
	}
}

/**
 * Highlights search matches in the editor using decorations.
 * This replaces the old <mark> tag implementation.
 * @param {Array<object>} matches - An array of match objects, e.g., [{start, end}, ...].
 * @param {number} current_index - The index of the currently selected match.
 */
export function highlight_search_matches(matches, current_index) {
	if (!editor) return;
	
	const decorations = matches.map((match, index) => {
		const model = editor.getModel();
		const start_pos = model.getPositionAt(match.start);
		const end_pos = model.getPositionAt(match.end);
		const range = new monaco.Range(start_pos.lineNumber, start_pos.column, end_pos.lineNumber, end_pos.column);
		
		const is_current = index === current_index;
		
		return {
			range: range,
			options: {
				className: is_current ? 'current-search-match' : 'search-match',
				inlineClassName: is_current ? 'current-search-match' : 'search-match',
				stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			}
		};
	});
	
	// The third argument is the ownerId, which can be used to clear decorations from a specific source.
	editor.deltaDecorations([], decorations);
	
	// If there's a current match, reveal it in the editor.
	if (current_index >= 0 && current_index < matches.length) {
		const current_match_decoration = decorations[current_index];
		if (current_match_decoration) {
			editor.revealRangeInCenter(current_match_decoration.range, monaco.editor.ScrollType.Smooth);
		}
	}
}

/**
 * Clears all search-related highlights from the editor.
 */
export function clear_search_highlights() {
	if (editor) {
		// This assumes we don't have other decorations. If we did, we'd need an ownerId.
		editor.deltaDecorations([], []);
	}
}
