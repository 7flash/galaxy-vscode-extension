const fs = require('fs');
const path = require('path');

// A set of common text-based file extensions to filter for.
// This is simpler than the original script's MIME-type/buffer checking
// and aligns with the file discovery logic in the main extension.
const textFileExtensions = new Set([
    '.txt', '.md', '.json', '.xml', '.html', '.css', '.js', '.ts', '.py',
    '.java', '.c', '.cpp', '.h', '.cs', '.go', '.php', '.rb', '.rs', '.sh',
    '.ps1', '.bat', '.sql', '.yaml', '.yml', '.ini', '.toml', '.cfg'
]);

const possibleExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Processes an input file, expanding file/directory paths into their contents.
 * @param {string} inputFile - Absolute path to the input prompt file.
 * @param {string} [rootDir] - Optional directory to resolve relative paths against. Defaults to the input file's directory.
 * @returns {string} The processed content with paths expanded.
 */
function runPrompter(inputFile, rootDir) {
    // --- Validate Arguments ---
    if (!inputFile) {
        throw new Error('Input file path is required.');
    }
    if (!fs.existsSync(inputFile)) {
        throw new Error(`Input file '${inputFile}' not found.`);
    }

    // --- Validate $HOME ---
    const homeDir = process.env.HOME;
    if (!homeDir) {
        throw new Error('$HOME environment variable is not defined.');
    }
    const homeDirPath = path.resolve(homeDir);

    // --- Determine Root Directory for Path Resolution ---
    const rootDirPath = rootDir ? path.resolve(rootDir) : path.resolve(path.dirname(inputFile));

    // --- Helper Functions ---

    function expandEnvVars(pathString) {
        return pathString.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, envVar) => {
            const envValue = process.env[envVar];
            return envValue !== undefined ? envValue : match;
        });
    }

    function processPath(inputPath, baseDir) {
        const expandedPath = expandEnvVars(inputPath);
        if (path.isAbsolute(expandedPath)) {
            return expandedPath;
        }
        return path.resolve(baseDir, expandedPath);
    }

    function getHomeRelativePath(fullPath) {
        const relPath = path.relative(homeDirPath, fullPath).replace(/\\/g, '/');
        return relPath.startsWith('.') ? relPath : `./${relPath}`;
    }

    function isTextFile(filePath) {
        return textFileExtensions.has(path.extname(filePath).toLowerCase());
    }

    function findFileWithPossibleExtensions(basePath) {
        if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
            return basePath;
        }
        let basePathWithoutExt = basePath;
        const ext = path.extname(basePath);
        if (ext) {
            basePathWithoutExt = basePath.substring(0, basePath.length - ext.length);
        }
        for (const extension of possibleExtensions) {
            const candidatePath = basePathWithoutExt + extension;
            if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
                return candidatePath;
            }
        }
        return null;
    }

    // --- Process the Input File ---
    const content = fs.readFileSync(inputFile, 'utf8');
    const lines = content.split('\n');
    let outputContent = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        const isPathReference = trimmedLine.startsWith('./') ||
            trimmedLine.startsWith('../') ||
            trimmedLine.startsWith('/') ||
            trimmedLine.startsWith('$');

        if (isPathReference) {
            const pathFromFile = trimmedLine;
            const processedPath = processPath(pathFromFile, rootDirPath);

            try {
                if (fs.existsSync(processedPath)) {
                    const stats = fs.statSync(processedPath);
                    if (stats.isDirectory()) {
                        const entries = fs.readdirSync(processedPath, { withFileTypes: true });
                        for (const entry of entries) {
                            if (entry.isFile()) {
                                const fullPath = path.join(processedPath, entry.name);
                                if (isTextFile(fullPath)) {
                                    const relPath = getHomeRelativePath(fullPath);
                                    const fileContent = fs.readFileSync(fullPath, 'utf8');
                                    outputContent += `${relPath}\n\`\`\`\n${fileContent}\n\`\`\`\n`;
                                }
                            }
                        }
                    } else if (stats.isFile()) {
                        if (isTextFile(processedPath)) {
                            const relPath = getHomeRelativePath(processedPath);
                            const fileContent = fs.readFileSync(processedPath, 'utf8');
                            outputContent += `${relPath}\n\`\`\`\n${fileContent}\n\`\`\`\n`;
                        }
                    } else {
                        outputContent += line + '\n'; // Path is not file/dir, keep original
                    }
                } else {
                    const actualFilePath = findFileWithPossibleExtensions(processedPath);
                    if (actualFilePath && isTextFile(actualFilePath)) {
                        const relPath = getHomeRelativePath(actualFilePath);
                        const fileContent = fs.readFileSync(actualFilePath, 'utf8');
                        outputContent += `${relPath}\n\`\`\`\n${fileContent}\n\`\`\`\n`;
                    } else {
                        outputContent += line + '\n'; // Not found, keep original
                    }
                }
            } catch (err) {
                // Could not access path, so just keep the original line
                outputContent += line + '\n';
            }
        } else {
            outputContent += line + '\n';
        }
    }

    // Return the processed content, ensuring it's a single string
    return outputContent;
}

module.exports = { runPrompter };