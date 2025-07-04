// SmartCodePrompts/js/utils.js

/**
 * Shows the main loading indicator with a custom message.
 * @param {string} [message='Loading...'] - The message to display.
 */
export function showLoading(message = 'Loading...') {
	const indicator = document.getElementById('loading-indicator');
	if (indicator) {
		indicator.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${message}`;
		indicator.style.display = 'inline-block';
	}
}

/**
 * Hides the main loading indicator.
 */
export function hideLoading() {
	const indicator = document.getElementById('loading-indicator');
	if (indicator) {
		indicator.style.display = 'none';
	}
}

/**
 * Gets the parent directory path from a full file path.
 * @param {string} filePath - The full path of the file.
 * @returns {string|null} The parent path or null.
 */
export function getParentPath(filePath) {
	if (!filePath || !filePath.includes('/')) return null;
	return filePath.substring(0, filePath.lastIndexOf('/'));
}

/**
 * Creates a unique string identifier for a project.
 * @param {object} project - The project object { rootIndex, path }.
 * @returns {string|null} The unique identifier.
 */
export function getProjectIdentifier(project) {
	if (!project) return null;
	return `${project.rootIndex}_${project.path}`;
}

/**
 * Parses a project identifier string back into an object.
 * @param {string} identifier - The unique project identifier.
 * @returns {object|null} The project object { rootIndex, path }.
 */
export function parseProjectIdentifier(identifier) {
	if (!identifier) return null;
	const parts = identifier.split('_');
	return {
		rootIndex: parseInt(parts[0], 10),
		path: parts.slice(1).join('_')
	};
}

/**
 * A reusable async function to handle POST requests using fetch.
 * @param {object} data - The data to send in the request body.
 * @returns {Promise<object>} A promise that resolves with the JSON response.
 * @throws {Error} If the request fails or the response is not ok.
 */
export async function postData(data) {
	const formData = new URLSearchParams();
	for (const key in data) {
		formData.append(key, data[key]);
	}
	
	const response = await fetch('/', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: formData
	});
	
	if (!response.ok) {
		let errorPayload = {error: `Request failed: ${response.statusText}`};
		try {
			errorPayload = await response.json();
		} catch (e) {
			// Ignore if response is not JSON
		}
		throw new Error(errorPayload.error);
	}
	return response.json();
}

/**
 * NEW: A simple markdown to HTML converter that also escapes any raw HTML in the source text.
 * This function is moved here to be shared between the QA and Direct Prompt features.
 * It supports fenced code blocks, inline code, bold, and italics.
 * @param {string} text The raw text from the LLM, which may contain markdown.
 * @returns {string} Sanitized and formatted HTML string.
 */
export function simpleMarkdownToHtml(text) {
	// Split the text by code blocks (```) to treat them separately.
	const parts = text.split('```');
	
	const finalHtml = parts.map((part, index) => {
		// An odd index (1, 3, 5...) indicates a code block.
		if (index % 2 === 1) {
			let codeContent = part;
			const firstNewline = part.indexOf('\n');
			
			// Simple check to strip a language hint from the first line (e.g., ```javascript)
			if (firstNewline !== -1) {
				const langHint = part.substring(0, firstNewline).trim();
				// A simple regex to see if it looks like a language name.
				if (langHint.match(/^[a-z0-9_-]+$/i) && langHint.length < 20) {
					codeContent = part.substring(firstNewline + 1);
				}
			}
			
			// Escape HTML entities inside the code block to display them as text.
			const escapedCode = codeContent
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			
			// Wrap in <pre> and <code>. The classes are for styling with Tailwind/DaisyUI.
			return `<pre class="bg-base-300 p-2 my-2 rounded-md text-sm overflow-x-auto"><code>${escapedCode.trim()}</code></pre>`;
			
		} else {
			// An even index (0, 2, 4...) indicates regular text.
			// Escape it first to prevent rendering of any raw HTML.
			let regularText = part
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			
			// Order of replacement matters for markdown parsing. Use non-greedy matchers.
			regularText = regularText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); // Bold
			regularText = regularText.replace(/\*(.+?)\*/g, '<em>$1</em>'); // Italic
			regularText = regularText.replace(/`(.+?)`/g, '<code class="bg-base-300 px-1 rounded-sm">$1</code>'); // Inline code
			
			// Convert newlines to <br> tags for this part only.
			return regularText.replace(/\n/g, '<br>');
		}
	}).join('');
	
	return finalHtml;
}
