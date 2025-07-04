// llm-php-helper/js/projects.js
import {postData, getProjectIdentifier} from './utils.js';

/**
 * Applies dark mode styling based on the body's class list.
 * MODIFIED: Toggles DaisyUI theme attribute and icon class.
 */
function applyDarkMode() {
	const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
	const toggleIcon = document.querySelector('#toggle-mode i');
	if (toggleIcon) {
		toggleIcon.classList.toggle('fa-sun', !isDarkMode);
		toggleIcon.classList.toggle('fa-moon', isDarkMode);
	}
}

/**
 * Renders the list of projects fetched from the server.
 * @param {Array<object>} projects - The list of project objects.
 */
function renderProjectList(projects) {
	const projectsListContainer = document.getElementById('projects-list');
	projectsListContainer.innerHTML = '';
	
	if (!projects || projects.length === 0) {
		projectsListContainer.innerHTML = '<p class="text-center text-error">No top-level folders found in your configured root directories.</p>';
		return;
	}
	
	// Group projects by their root directory path for better organization.
	const groupedProjects = projects.reduce((acc, project) => {
		if (!acc[project.rootPath]) {
			acc[project.rootPath] = [];
		}
		acc[project.rootPath].push(project);
		return acc;
	}, {});
	
	// Build the HTML for each group and append it to the container.
	let html = '';
	for (const rootPath in groupedProjects) {
		// MODIFIED: Use Tailwind/DaisyUI classes for headings and layout.
		html += `<h5 class="mt-4 text-base-content/70 w-full col-span-full">${rootPath}</h5>`;
		groupedProjects[rootPath].forEach(function (project) {
			const isChecked = project.isChecked;
			const identifier = getProjectIdentifier(project);
			// MODIFIED: Use DaisyUI card and form-control structure.
			html += `
                <div class="card bg-base-200 shadow-md hover:bg-base-300 transition-colors">
                    <div class="card-body p-4">
                        <label for="proj-${identifier}" class="label cursor-pointer justify-start gap-4">
                             <input class="checkbox checkbox-primary" type="checkbox" value="${identifier}" id="proj-${identifier}" data-root-index="${project.rootIndex}" data-path="${project.path}" ${isChecked ? 'checked' : ''}>
                             <span class="label-text text-lg">${project.path}</span>
                        </label>
                    </div>
                </div>
            `;
		});
	}
	// MODIFIED: Use Tailwind grid for the project list layout.
	projectsListContainer.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4';
	projectsListContainer.insertAdjacentHTML('beforeend', html);
}

/**
 * Loads all necessary data from the server to initialize the page.
 */
async function loadPageData() {
	try {
		// Fetch the list of all possible projects and their selection status.
		const projectsData = await postData({action: 'get_projects_page_data'});
		renderProjectList(projectsData.projects);
		
		// Fetch main app settings, primarily for dark mode consistency.
		const mainData = await postData({action: 'get_main_page_data'});
		// MODIFIED: Set DaisyUI theme attribute instead of a body class.
		if (mainData.darkMode) {
			document.documentElement.setAttribute('data-theme', 'dark');
		} else {
			document.documentElement.setAttribute('data-theme', 'light');
		}
		applyDarkMode();
	} catch (error) {
		document.getElementById('projects-list').innerHTML = '<p class="text-center text-error">Error loading project list. Check server logs.</p>';
		console.error("Error fetching page data:", error);
	}
}

// --- Event Listeners ---

// Event listener for the dark mode toggle button.
// MODIFIED: Toggles the `data-theme` attribute for DaisyUI.
document.getElementById('toggle-mode').addEventListener('click', () => {
	const html = document.documentElement;
	const isDarkMode = html.getAttribute('data-theme') === 'dark';
	const newTheme = isDarkMode ? 'light' : 'dark';
	html.setAttribute('data-theme', newTheme);
	applyDarkMode();
	// Save the dark mode state to the server.
	postData({action: 'set_dark_mode', isDarkMode: !isDarkMode})
		.catch(err => console.error("Failed to save dark mode setting.", err));
});

// Use event delegation on the container to handle clicks on dynamically added checkboxes.
document.getElementById('projects-list').addEventListener('change', async (e) => {
	// Ensure the event was triggered by a project checkbox.
	if (e.target.matches('input[type="checkbox"]')) {
		const checkbox = e.target;
		const projectData = checkbox.dataset; // Access data-* attributes.
		try {
			await postData({
				action: 'toggle_project',
				rootIndex: projectData.rootIndex,
				path: projectData.path,
				isSelected: checkbox.checked
			});
		} catch (error) {
			alert('Failed to save project selection. Please try again.');
			// Revert the checkbox on failure to keep UI consistent with the server state.
			checkbox.checked = !checkbox.checked;
		}
	}
});

// --- Initial Load ---
loadPageData();
