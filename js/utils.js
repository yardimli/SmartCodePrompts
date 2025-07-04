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
