// SmartCodePrompts/js/utils.js

/**
 * Shows the main loading indicator with a custom message.
 * @param {string} [message='Loading...'] - The message to display.
 */
export function show_loading (message = 'Loading...') {
	const indicator = document.getElementById('loading-indicator');
	if (indicator) {
		indicator.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${message}`;
		indicator.style.display = 'inline-block';
	}
}

export function hide_loading () {
	const indicator = document.getElementById('loading-indicator');
	if (indicator) {
		indicator.style.display = 'none';
	}
}

/**
 * Gets the parent directory path from a full file path.
 * @param {string} file_path - The full path of the file.
 * @returns {string|null} The parent path or null.
 */
export function get_parent_path (file_path) {
	if (!file_path || !file_path.includes('/')) return null;
	return file_path.substring(0, file_path.lastIndexOf('/'));
}

/**
 * A reusable async function to handle IPC requests to the main process.
 * @param {object} data - The data to send, must include an 'action' property.
 * @returns {Promise<object>} A promise that resolves with the JSON response from the main process.
 * @throws {Error} If the main process returns an error.
 */
export async function post_data (data) {
	try {
		// The 'electronAPI' is exposed on the window object by the preload script.
		const result = await window.electronAPI.postData(data);
		return result;
	} catch (error) {
		// Errors thrown in the main process are propagated here.
		console.error('Error from main process:', error);
		// Re-throw the error so calling functions can handle it.
		throw error;
	}
}

/**
 * Estimates the number of tokens in a string.
 * A common approximation is 1 token per 4 characters.
 * @param {string} text - The text to estimate.
 * @returns {number} The estimated token count.
 */
export function estimate_tokens (text) {
	if (!text) return 0;
	return Math.ceil(text.length / 3.5);
}

/**
 * A simple markdown to HTML converter that also escapes any raw HTML in the source text.
 * This function is moved here to be shared between the QA and Direct Prompt features.
 * It supports fenced code blocks, inline code, bold, and italics.
 * Code blocks are enhanced with a "Copy to Clipboard" button.
 * @param {string} text The raw text from the LLM, which may contain markdown.
 * @returns {string} Sanitized and formatted HTML string.
 */
export function simple_markdown_to_html (text) {
	// Split the text by code blocks (```) to treat them separately.
	const parts = text.split('```');
	
	const final_html = parts.map((part, index) => {
		// An odd index (1, 3, 5...) indicates a code block.
		if (index % 2 === 1) {
			let code_content = part;
			const first_newline = part.indexOf('\n');
			
			// Simple check to strip a language hint from the first line (e.g., ```javascript)
			if (first_newline !== -1) {
				const lang_hint = part.substring(0, first_newline).trim();
				// A simple regex to see if it looks like a language name.
				if (lang_hint.match(/^[a-z0-9_-]+$/i) && lang_hint.length < 20) {
					code_content = part.substring(first_newline + 1);
				}
			}
			
			// Escape HTML entities inside the code block to display them as text.
			const escaped_code = code_content
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			
			return `<div class="relative group my-2">
                        <button class="copy-code-button btn btn-xs btn-ghost absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10" title="Copy code">
                            <i class="bi bi-clipboard"></i> Copy
                        </button>
                        <pre class="bg-accent p-2 rounded-md text-sm overflow-x-auto pt-8"><code>${escaped_code.trim()}</code></pre>
                    </div>`;
			
		} else {
			// An even index (0, 2, 4...) indicates regular text.
			// Escape it first to prevent rendering of any raw HTML.
			let regular_text = part
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			
			// Order of replacement matters for markdown parsing. Use non-greedy matchers.
			regular_text = regular_text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); // Bold
			regular_text = regular_text.replace(/\*(.+?)\*/g, '<em>$1</em>'); // Italic
			regular_text = regular_text.replace(/`(.+?)`/g, '<code class="bg-accent px-1 rounded-sm">$1</code>'); // Inline code
			
			// Convert newlines to <br> tags for this part only.
			return regular_text.replace(/\n/g, '<br>');
		}
	}).join('');
	
	return final_html;
}
