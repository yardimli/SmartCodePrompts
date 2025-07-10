// SmartCodePrompts/js/modal-diff.js

import { post_data } from './utils.js';
import { get_current_project } from './state.js';

let diff_modal = null;
let diff_editor = null;
let original_model = null;
let modified_model = null;

/**
 * Initializes the diff modal and the Monaco diff editor within it.
 * This should be called once when the application loads.
 */
export function initialize_diff_modal() {
	diff_modal = document.getElementById('diff_modal');
	if (!diff_modal) {
		console.error('Diff modal element not found!');
		return;
	}
	
	const editor_container = document.getElementById('diff-modal-editor-container');
	if (!editor_container) {
		console.error('Diff modal editor container not found!');
		return;
	}
	
	// Use require to load monaco on demand
	require(['vs/editor/editor.main'], () => {
		// Get the current theme from the document element
		const is_dark_mode = document.documentElement.getAttribute('data-theme') === 'dark';
		
		diff_editor = monaco.editor.createDiffEditor(editor_container, {
			theme: is_dark_mode ? 'vs-dark' : 'vs',
			wordWrap: 'on',
			renderSideBySide: false, // Force inline view
			originalEditable: false,
			readOnly: true, // Both panes are read-only in this view
			automaticLayout: true,
			scrollBeyondLastLine: false,
		});
		
		// Create empty models to start with
		original_model = monaco.editor.createModel('', 'text/plain');
		modified_model = monaco.editor.createModel('', 'text/plain');
		
		diff_editor.setModel({
			original: original_model,
			modified: modified_model
		});
	});
}

/**
 * Opens the diff modal and displays the changes for a specific file.
 * @param {string} file_path - The path of the file to show the diff for.
 */
export async function show_diff_modal(file_path) {
	if (!diff_modal || !diff_editor) {
		console.error('Diff modal is not initialized.');
		return;
	}
	
	const title_el = document.getElementById('diff-modal-title');
	title_el.textContent = `Loading changes for ${file_path}...`;
	diff_modal.showModal();
	
	// Clear previous content while loading
	original_model.setValue('Loading original content...');
	modified_model.setValue('Loading current content...');
	
	try {
		const current_project = get_current_project();
		if (!current_project) {
			throw new Error('No project is currently selected.');
		}
		
		const data = await post_data({
			action: 'get_file_for_editor',
			project_path: current_project.path,
			path: file_path
		});
		
		const current_content = data.currentContent ?? `/* File not found or is empty: ${file_path} */`;
		const original_content = data.originalContent ?? `/* No original content found in Git HEAD for: ${file_path} */`;
		
		// Determine language from file path for syntax highlighting
		const extension = '.' + file_path.split('.').pop();
		const languages = monaco.languages.getLanguages();
		const lang = languages.find(l => l.extensions && l.extensions.includes(extension));
		const language_id = lang ? lang.id : 'plaintext';
		
		// Update models with new content and language
		monaco.editor.setModelLanguage(original_model, language_id);
		monaco.editor.setModelLanguage(modified_model, language_id);
		original_model.setValue(original_content);
		modified_model.setValue(current_content);
		
		title_el.textContent = `Changes for: ${file_path}`;
		
		// A short timeout to allow the modal to render before calculating layout
		setTimeout(() => {
			diff_editor.layout();
		}, 100);
		
	} catch (error) {
		console.error(`Error opening diff for file ${file_path}:`, error);
		title_el.textContent = `Error loading diff for ${file_path}`;
		modified_model.setValue(`Error fetching file content: ${error.message}`);
		original_model.setValue('');
	}
}
