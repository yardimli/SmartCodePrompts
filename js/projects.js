// llm-php-helper/js/projects.js
import {postData, getProjectIdentifier} from './utils.js';

/**
 * Applies dark mode styling based on the body's class list.
 */
function applyDarkMode() {
	const isDarkMode = document.body.classList.contains('dark-mode');
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
		projectsListContainer.innerHTML = '<p class="text-center text-danger">No top-level folders found in your configured root directories.</p>';
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
		html += `<h5 class="mt-4 text-muted w-100">${rootPath}</h5>`;
		html += '<div class="row">';
		groupedProjects[rootPath].forEach(function (project) {
			const isChecked = project.isChecked;
			const identifier = getProjectIdentifier(project);
			// Using data-* attributes to store project info directly on the element.
			html += `
                <div class="col-12 col-md-6 col-lg-3 mb-3">
                    <div class="project-card form-check p-3 border rounded h-100">
                        <input class="form-check-input" type="checkbox" value="${identifier}" id="proj-${identifier}" data-root-index="${project.rootIndex}" data-path="${project.path}" ${isChecked ? 'checked' : ''}>
                        <label class="form-check-label" for="proj-${identifier}">
                            ${project.path}
                        </label>
                    </div>
                </div>
            `;
		});
		html += '</div>';
	}
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
		if (mainData.darkMode) {
			document.body.classList.add('dark-mode');
		}
		applyDarkMode();
	} catch (error) {
		document.getElementById('projects-list').innerHTML = '<p class="text-center text-danger">Error loading project list. Check server logs.</p>';
		console.error("Error fetching page data:", error);
	}
}

// --- Event Listeners ---

// Event listener for the dark mode toggle button.
document.getElementById('toggle-mode').addEventListener('click', () => {
	document.body.classList.toggle('dark-mode');
	const isDarkMode = document.body.classList.contains('dark-mode');
	applyDarkMode();
	// Save the dark mode state to the server.
	postData({action: 'set_dark_mode', isDarkMode: isDarkMode})
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
