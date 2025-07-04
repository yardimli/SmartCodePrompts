/** @type {import('tailwindcss').Config} */
module.exports = {
	// Configure files to scan for Tailwind classes.
	content: [
		'./*.html',
		'./js/**/*.js',
	],
	theme: {
		extend: {},
	},
	// Enable the DaisyUI plugin.
	plugins: [
		require('daisyui'),
	],
	// Configure DaisyUI themes to match the existing light/dark mode functionality.
	daisyui: {
		themes: ["light", "dark"],
	},
};
