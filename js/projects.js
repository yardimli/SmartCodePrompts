// SmartCodePrompts/js/projects.js
import {post_data, get_project_identifier} from './utils.js';


function apply_dark_mode() {
	const is_dark_mode = document.documentElement.getAttribute('data-theme') === 'dark';
	const toggle_icon = document.querySelector('#toggle-mode i');
	if (toggle_icon) {
		toggle_icon.classList.toggle('bi-sun', !is_dark_mode);
		toggle_icon.classList.toggle('bi-moon', is_dark_mode);
	}
}

/**
 * Renders the list of projects fetched from the server.
 * @param {Array<object>} projects - The list of project objects.
 */
function render_project_list(projects) {
	const projects_list_container = document.getElementById('projects-list');
	projects_list_container.innerHTML = '';
	
	if (!projects || projects.length === 0) {
		projects_list_container.innerHTML = '<p class="text-center text-error">No top-level folders found in your configured root directories.</p>';
		return;
	}
	
	// Group projects by their root directory path for better organization.
	const grouped_projects = projects.reduce((acc, project) => {
		if (!acc[project.root_path]) {
			acc[project.root_path] = [];
		}
		acc[project.root_path].push(project);
		return acc;
	}, {});
	
	// Build the HTML for each group and append it to the container.
	let html = '';
	for (const root_path in grouped_projects) {
		html += `<h5 class="mt-4 text-base-content/70 w-full col-span-full">${root_path}</h5>`;
		grouped_projects[root_path].forEach(function (project) {
			const is_checked = project.is_checked;
			const identifier = get_project_identifier(project);
			html += `
                <div class="card bg-base-200 shadow-md hover:bg-base-300 transition-colors">
                    <div class="card-body p-4">
                        <label for="proj-${identifier}" class="label cursor-pointer justify-start gap-4">
                             <input class="checkbox checkbox-primary" type="checkbox" value="${identifier}" id="proj-${identifier}" data-path="${project.path}" ${is_checked ? 'checked' : ''}>
                             <span class="label-text text-lg">${project.path}</span>
                        </label>
                    </div>
                </div>
            `;
		});
	}
	projects_list_container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4';
	projects_list_container.insertAdjacentHTML ('beforeend', html);
}

/**
 * Loads all necessary data from the server to initialize the page.
 */
async function load_page_data() {
	try {
		// Fetch the list of all possible projects and their selection status.
		const projects_data = await post_data({action: 'get_projects_page_data'});
		render_project_list(projects_data.projects);
		
		// Fetch main app settings, primarily for dark mode consistency.
		const main_data = await post_data({action: 'get_main_page_data'});
		if (main_data.dark_mode) {
			document.documentElement.setAttribute('data-theme', 'dark');
		} else {
			document.documentElement.setAttribute('data-theme', 'light');
		}
		apply_dark_mode();
	} catch (error) {
		document.getElementById('projects-list').innerHTML = '<p class="text-center text-error">Error loading project list. Check server logs.</p>';
		console.error("Error fetching page data:", error);
	}
}

// --- Event Listeners ---

document.getElementById('toggle-mode').addEventListener('click', () => {
	const html = document.documentElement;
	const is_dark_mode = html.getAttribute('data-theme') === 'dark';
	const new_theme = is_dark_mode ? 'light' : 'dark';
	html.setAttribute('data-theme', new_theme);
	apply_dark_mode();
	// Save the dark mode state to the server.
	post_data({action: 'set_dark_mode', is_dark_mode: !is_dark_mode})
		.catch(err => console.error("Failed to save dark mode setting.", err));
});

// Use event delegation on the container to handle clicks on dynamically added checkboxes.
document.getElementById('projects-list').addEventListener('change', async (e) => {
	// Ensure the event was triggered by a project checkbox.
	if (e.target.matches('input[type="checkbox"]')) {
		const checkbox = e.target;
		const project_data = checkbox.dataset; // Access data-* attributes.
		try {
			await post_data({
				action: 'toggle_project',
				path: project_data.path,
				is_selected: checkbox.checked
			});
		} catch (error) {
			alert('Failed to save project selection. Please try again.');
			// Revert the checkbox on failure to keep UI consistent with the server state.
			checkbox.checked = !checkbox.checked;
		}
	}
});

// --- Initial Load ---
load_page_data();
