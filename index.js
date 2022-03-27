const core = require('@actions/core');
const axios = require('axios');
const fs = require('fs');

require('dotenv').config();





const fail = (statusCode, message) => {
	return {
		success: false,
		message,
		statusCode,
		result: undefined,
	}
}

const getConfig = () => {
	if (process.env.GITHUB_ACTIONS) {
		return {
			fromGHA: true,
			repoOwner: core.getInput('repo-owner', { required: true }),
			repoName: core.getInput('repo-name', { required: true }),
			repoCommit: core.getInput('repo-commit', { required: true }),
			authToken: core.getInput('github-pat', { required: true }),
			outputPath: core.getInput('output-path', { required: true }),
			prettify: !!core.getBooleanInput('prettify'),
		}
	} else {
		return {
			fromGHA: false,
			repoOwner: process.env.REPO_OWNER,
			repoName: process.env.REPO_NAME,
			repoCommit: process.env.REPO_COMMIT,
			authToken: process.env.AUTH_TOKEN,
			outputPath: process.env.OUTPUT_PATH,
			prettify: !!process.env.PRETTIFY,
		}
	}
}

const ensureDirExists = async (path) => {
	const pathNoFile = path.substring(0, path.lastIndexOf("/"));
	await fs.promises.mkdir(pathNoFile, { recursive: true });
}





const recurseSourceFilesTree = (node, callback) => {
	callback(node)
	if (node.tree) {
		node.tree.forEach(child => {
			recurseSourceFilesTree(child, callback)
		})
	}
}

const buildSourceFilesTree = (config, data) => {
	// Create resulting root node
	const result = {
		name: config.repoName,
		kind: 'dir',
		tree: [],
	}
	// Go through tree nodes from data
	data.tree.forEach(info => {
		let obj = result
		// Go through path string for tree nodes
		const parts = info['path'].split('/')
		const count = parts.length
		for (const [index, part] of parts.entries()) {
			// Try to find an existing corresponding child
			let found = false
			for (const [_, child] of obj.tree.entries()) {
				if (child.name === part) {
					found = true;
					obj = child;
					break
				}
			}
			// If no child was found, create it
			if (!found) {
				const newobj = {
					name: part,
					kind: 'dir',
					tree: [],
				}
				obj.tree.push(newobj)
				obj = newobj
			}
			// If we got a file reference and are at the
			// last index, set the kind of the tree node
			// to be a file, and separate the extension
			// from the name of the file
			if (info['type'] === 'blob') {
				if (index === count - 1) {
					obj.kind = 'file';
					const subparts = part.split('.');
					if (subparts[0].trim() === '') {
						subparts.shift();
					}
					if (!obj.name.startsWith('.') && subparts.length > 1) {
						obj.ext = subparts.pop();
					} else {
						obj.ext = obj.name
					}
				}
			}
		}
	});
	// Recursively sort children
	recurseSourceFilesTree(result, (node) => {
		if (node.tree) {
			node.tree.sort((n0, n1) => {
				// Sort by file extension first
				if (n0.ext && n1.ext) {
					if (n0.ext < n1.ext) { return -1; }
					if (n0.ext > n1.ext) { return 1; }
				}
				// Fallback to sort by name
				if (n0.name < n1.name) { return -1; }
				if (n0.name > n1.name) { return 1; }
				// Same name???
				return 0;
			});
		}
	});
	// Recursively remove children from nodes that are files
	recurseSourceFilesTree(result, (node) => {
		if (node.kind === 'file') {
			if (node.tree) {
				delete node.tree;
			}
		}
	});
	// Return root node
	return result;
}





const createSourceFiles = async (config) => {
	console.log('Processing...')
	// Fetch the repository tree
	return await (axios.default({
		method: 'GET',
		url: `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/git/trees/${config.repoCommit}?recursive=1`,
		headers: {
			'Accept': 'application/vnd.github.v3+json',
			'Content-Type': 'application/json',
			'Authorization': `token ${config.authToken}`,
		}
	}).then(async (res) => {
		// Make sure we got a proper response json
		const data = (typeof res.data === 'string') ? JSON.parse(res.data) : res.data
		if (typeof data === 'object') {
			if (
				(typeof data["sha"]  === 'string') &&
				(typeof data["url"]  === 'string') &&
				(typeof data["tree"] === 'object')
			) {
				const tree = buildSourceFilesTree(config, data);
				return {
					success: true,
					message: 'OK',
					statusCode: 0,
					result: tree
				};
			}
		}
		// We got some weird undocumented response
		return fail(res.status, `Unknown response: ${data}`);
	}).catch((error) => {
		if (error.response) {
			const statusCode = error.response.status
			// The request was made and the server responded with
			// a status code that falls out of the range of 2xx
			return fail(statusCode, `${statusCode} ${error.response.statusText}`);
		} else if (error.request) {
			// The request was made but no response was received
			return fail(0, 'No response from server');
		} else {
			// Something bad happened in setting up
			// the request that triggered an Error
			return fail(0, `Error: ${error.message}`);
		}
	}))
}





const run = async (config) => {
	// Empty line first to make things look nice
	console.log('')
	// Perform task
	const result = await createSourceFiles(config);
	if (!result.success) {
		return fail(
			result.statusCode,
			result.message
		)
	}
	// Stringify result for writing to file
	console.log('')
	console.log('Serializing...')
	const spacing = config.prettify ? '    ' : null
	const output = JSON.stringify(result.result, null, spacing);
	console.log('')
	// Make sure the directories for the
	// output path exists, otherwise create
	if (config.outputPath.indexOf('/') !== -1) {
		console.log('Writing directory...')
		await ensureDirExists(config.outputPath);
	}
	// Write the serialized json file to disk
	console.log('Writing file...')
	await fs.promises.writeFile(config.outputPath, output);
	// Done!
	return {
		success: true,
		message: 'OK',
		statusCode: 0,
		result: null,
	}
}





const config = getConfig()

run(config).then(res => {
	if (res.success) {
		if (config.fromGHA) {
			core.setOutput('success', 'true')
			core.setOutput('message', 'OK')
		} else {
			console.log('')
			console.log('Files created successfully!')
		}
	} else {
		if (config.fromGHA) {
			core.setOutput('success', 'false')
			core.setOutput('message', res.message)
			core.setFailed(res.message)
		} else {
			console.log('')
			console.log(res.message)
		}
	}
}).catch(err => {
	if (config.fromGHA) {
		core.setOutput('success', 'false')
		core.setOutput('message', err)
		core.setFailed(err)
	} else {
		console.log('')
		console.error(err)
	}
})