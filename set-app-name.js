const fs = require('fs');
const path = require('path');
const plist = require('plist');

// Only run this script on macOS
if (process.platform !== 'darwin') {
	process.exit(0);
}

console.log('macOS detected. Setting development app name...');

try {
	const packageJson = require('./package.json');
	const productName = packageJson.build && packageJson.build.productName;
	
	if (!productName) {
		console.error('Error: `build.productName` not found in package.json.');
		process.exit(1);
	}
	
	const plistPath = path.join(
		__dirname,
		'node_modules',
		'electron',
		'dist',
		'Electron.app',
		'Contents',
		'Info.plist'
	);
	
	if (!fs.existsSync(plistPath)) {
		console.error(`Error: Info.plist not found at ${plistPath}`);
		console.error('This script should be run from the project root after `npm install`.');
		process.exit(1);
	}
	
	const plistFile = fs.readFileSync(plistPath, 'utf8');
	const plistData = plist.parse(plistFile);
	
	// Update the display name and the bundle name
	plistData.CFBundleDisplayName = productName;
	plistData.CFBundleName = productName;
	
	const updatedPlist = plist.build(plistData);
	fs.writeFileSync(plistPath, updatedPlist);
	
	console.log(`Successfully set app name to "${productName}" for development.`);
	
} catch (error) {
	console.error('An error occurred while setting the app name:', error);
	process.exit(1);
}
