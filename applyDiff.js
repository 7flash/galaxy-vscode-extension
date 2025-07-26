const fs = require('fs');
const path = require('path');
const os = require('os');

class DiffApplier {
  
  parseDiff(diffText) {
    const lines = diffText.split('\n').map(l => l.replace(/\xa0/g, ' '));
    const files = [];
    let currentFile = null;
    let currentOperations = [];
    let currentHeaderContext = null;
    let currentLineNumber = undefined;
    let isNewFile = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trimEnd();

      // Handle both malformed headers (with + prefix) and correctly formatted headers
      if (line.startsWith('diff --git') || 
          line.startsWith('--- a/') || 
          line.startsWith('--- /dev/null') ||
          line.match(/^\++--- a\//) || 
          line.match(/^\++--- \/dev\/null/)) {
        this.finishCurrentHunk(currentFile, currentOperations, currentHeaderContext, currentLineNumber);
        this.finishCurrentFile(files, currentFile);
        
        isNewFile = false;
        
        let filename = 'unknown';
        if (line.startsWith('diff --git')) {
          const match = line.match(/diff --git a\/(.+) b\/(.+)/);
          filename = match ? (match[2] || match[1]) : 'unknown';
        } else if (line.startsWith('--- a/')) {
          const match = line.match(/--- a\/(.+)/);
          filename = match ? match[1] : 'unknown';
        } else if (line.startsWith('--- /dev/null')) {
          isNewFile = true;
        } else if (line.match(/^\++--- a\//)) {
          const match = line.match(/^\++--- a\/(.+)/);
          filename = match ? match[1] : 'unknown';
        } else if (line.match(/^\++--- \/dev\/null/)) {
          isNewFile = true;
        }
        
        currentFile = { filename, hunks: [], isNewFile };
        currentOperations = [];
        currentHeaderContext = null;
        currentLineNumber = undefined;
      }
      else if (line.startsWith('+++ b/') || line.match(/^\++\+\+ b\//)) {
        let match;
        if (line.startsWith('+++ b/')) {
          match = line.match(/\+\+\+ b\/(.+)/);
        } else {
          match = line.match(/^\++\+\+ b\/(.+)/);
        }
        
        if (match && currentFile) {
          currentFile.filename = match[1];
        }
      }
      else if (line.startsWith('new file mode')) {
        if (currentFile) {
          currentFile.isNewFile = true;
          isNewFile = true;
        }
      }
      else if (line.startsWith('@@') || line.startsWith('+@@')) {
        this.finishCurrentHunk(currentFile, currentOperations, currentHeaderContext, currentLineNumber);
        currentOperations = [];
        
        // Handle malformed @@ headers that might have + prefix
        const cleanedHeaderLine = line.replace(/^\++/, '');
        
        // Extract line number and context from @@ header
        const headerMatch = cleanedHeaderLine.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@\s*(.+)?/);
        if (headerMatch) {
          currentLineNumber = parseInt(headerMatch[1], 10); // Use the "from" line number
          currentHeaderContext = headerMatch[3] ? headerMatch[3].trim() : null;
        } else {
          currentHeaderContext = null;
          currentLineNumber = undefined;
        }
      }
      else if (line.startsWith('index ') || line === '') {
        continue;
      }
      else if (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-')) {
        // Skip both malformed and correctly formatted headers that are handled above
        if (line.startsWith('+@@') || 
            line.startsWith('--- a/') ||
            line.startsWith('--- /dev/null') ||
            line.startsWith('+++ b/') ||
            line.match(/^\++--- /) || 
            line.match(/^\++\+\+ /)) {
          continue;
        }
        
        const operation = line[0];
        const content = line.slice(1);
        
        if (operation === ' ') {
          currentOperations.push({ type: 'context', line: content });
        } else if (operation === '+') {
          currentOperations.push({ type: 'add', line: content });
        } else if (operation === '-') {
          currentOperations.push({ type: 'remove', line: content });
        }
      }
    }
    
    this.finishCurrentHunk(currentFile, currentOperations, currentHeaderContext, currentLineNumber);
    this.finishCurrentFile(files, currentFile);
    
    return files;
  }
  
  finishCurrentHunk(currentFile, operations, headerContext, lineNumber) {
    if (currentFile && operations.length > 0) {
      currentFile.hunks.push({ 
        operations, 
        headerContext,
        lineNumber 
      });
    }
  }
  
  finishCurrentFile(files, currentFile) {
    if (currentFile && currentFile.hunks.length > 0) {
      files.push(currentFile);
    }
  }

  createNewFile(fileLines, hunks) {
    const result = [];
    let appliedChanges = 0;
    
    for (const hunk of hunks) {
      for (const operation of hunk.operations) {
        if (operation.type === 'add') {
          result.push(operation.line);
          appliedChanges++;
        }
      }
    }
    
    return { result, success: appliedChanges > 0 };
  }
  
  normalizeLineForMatching(line) {
    if (line.trim().length < 1) {
      return '';
    }
    // More aggressive whitespace normalization for matching
    const normalized = line
      .trim()
      .replace(/\s+/g, ' ')  // Collapse multiple spaces/tabs to single space
      .replace(/\s*([{}();,])\s*/g, '$1'); // Remove spaces around punctuation
    
    // Debug excessive normalization - if original line was meaningful but normalized is empty/simple
    if (line.trim().length > 3 && normalized.length <= 1) {
      console.log(`    ⚠ Over-normalized: "${line.trim()}" → "${normalized}"`);
    }
    
    return normalized;
  }
  
  findAllContextMatches(fileLines, operations, startSearchPos = 0) {
    const contextLines = operations
      .filter(op => op.type === 'context')
      .map(op => this.normalizeLineForMatching(op.line));
    
    const removeLines = operations
      .filter(op => op.type === 'remove')
      .map(op => this.normalizeLineForMatching(op.line));
    
    console.log(`    → Looking for context: [${contextLines.map(l => `"${l}"`).join(', ')}]`);
    console.log(`    → Looking for removals: [${removeLines.map(l => `"${l}"`).join(', ')}]`);
    
    if (removeLines.length === 0) {
      console.log(`    → Pure addition hunk - no removals to validate`);
    }
    
    // Special handling for hunks with no context lines (pure additions/removals)
    if (contextLines.length === 0 && removeLines.length === 0) {
      // Pure addition - return the start search position as the match
      return [{ startPos: startSearchPos, contextLines: 0, removeMatches: 0, totalOperations: operations.length }];
    }
    
    const matches = [];
    
    // If we have context lines, find those first
    if (contextLines.length > 0) {
      for (let i = startSearchPos; i <= fileLines.length - contextLines.length; i++) {
        const contextMatch = this.findContextSequenceAt(fileLines, contextLines, i);
        if (!contextMatch.found) continue;
        
        // For context matches, be more lenient with removal validation
        // Check if MOST removal lines exist somewhere in the file (not necessarily nearby)
        let isValidMatch = false;
        
        if (removeLines.length === 0) {
          // Pure addition hunk - no removals to validate
          isValidMatch = true;
        } else {
          const removeMatches = this.countRemovalMatchesInFile(fileLines, removeLines);
          const removalThreshold = Math.floor(removeLines.length * 0.7); // At least 70% of removals should exist
          isValidMatch = removeMatches >= removalThreshold;
          
          if (!isValidMatch) {
            console.log(`    → Context at ${i + 1} rejected: only ${removeMatches}/${removeLines.length} removals found (need ${removalThreshold})`);
          }
        }
        
        if (isValidMatch) {
          const removeMatches = removeLines.length === 0 ? 0 : this.countRemovalMatchesInFile(fileLines, removeLines);
          matches.push({
            startPos: i,
            contextLines: contextLines.length,
            removeMatches,
            totalOperations: operations.length
          });
        }
      }
    } else {
      // No context lines - fall back to removal-based matching with anchor guidance
      console.log(`    → No context lines - using removal-based matching around anchor`);
      
      const searchPositions = [
        startSearchPos,
        Math.max(0, startSearchPos - 5),
        Math.max(0, startSearchPos - 10),
        Math.min(fileLines.length - 1, startSearchPos + 5),
        Math.min(fileLines.length - 1, startSearchPos + 10)
      ];
      
      for (const pos of searchPositions) {
        const removeMatches = this.countRemovalMatches(fileLines, removeLines, pos, 10);
        if (removeMatches === removeLines.length) {
          matches.push({
            startPos: pos,
            contextLines: 0,
            removeMatches,
            totalOperations: operations.length
          });
        }
      }
    }
    
    // Sort matches by quality
    matches.sort((a, b) => {
      const scoreA = a.removeMatches + a.contextLines;
      const scoreB = b.removeMatches + b.contextLines;
      return scoreB - scoreA;
    });
    
    console.log(`    → Found ${matches.length} valid matches (context-focused filtering)`);
    return matches;
  }
  
  countRemovalMatchesInFile(fileLines, removeLines) {
    if (removeLines.length === 0) return 0;
    
    let matches = 0;
    const usedIndices = new Set();
    
    for (const removeLine of removeLines) {
      for (let j = 0; j < fileLines.length; j++) {
        if (!usedIndices.has(j) && fileLines[j] && this.normalizeLineForMatching(fileLines[j]) === removeLine) {
          matches++;
          usedIndices.add(j);
          break;
        }
      }
    }
    
    return matches;
  }
  
  findContextSequenceAt(fileLines, contextLines, startPos) {
    if (contextLines.length === 0) return { found: true, endPos: startPos };
    
    let fileIndex = startPos;
    
    for (const contextLine of contextLines) {
      // Find the next occurrence of this context line
      while (fileIndex < fileLines.length && this.normalizeLineForMatching(fileLines[fileIndex]) !== contextLine) {
        fileIndex++;
      }
      
      if (fileIndex >= fileLines.length) {
        return { found: false, endPos: fileIndex };
      }
      
      fileIndex++; // Move past the matched line
    }
    
    return { found: true, endPos: fileIndex };
  }
  
  countRemovalMatches(fileLines, removeLines, centerPos, searchRange) {
    if (removeLines.length === 0) return 0;
    
    const searchStart = Math.max(0, centerPos - searchRange);
    const searchEnd = Math.min(fileLines.length, centerPos + searchRange);
    
    let matches = 0;
    const usedIndices = new Set(); // Prevent double-counting the same line
    
    for (const removeLine of removeLines) {
      for (let j = searchStart; j < searchEnd; j++) {
        if (!usedIndices.has(j) && fileLines[j] && this.normalizeLineForMatching(fileLines[j]) === removeLine) {
          matches++;
          usedIndices.add(j);
          break;
        }
      }
    }
    
    return matches;
  }
  
  validateMatch(fileLines, operations, match) {
    const removeLines = operations.filter(op => op.type === 'remove');
    
    if (removeLines.length === 0) return true;
    
    // Check that all remove lines can be found in a reasonable range
    const searchStart = Math.max(0, match.startPos - 5);
    const searchEnd = Math.min(fileLines.length, match.startPos + 20);
    
    for (const removeOp of removeLines) {
      let found = false;
      for (let i = searchStart; i < searchEnd; i++) {
        if (fileLines[i] && fileLines[i].trim() === removeOp.line.trim()) {
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }
    
    return true;
  }
  
  findAnchor(fileLines, headerContext) {
    if (!headerContext) return 0;
    
    const normalizedContext = this.normalizeLineForMatching(headerContext);
    console.log(`    → Searching for header anchor: "${normalizedContext}"`);
    
    // Try exact match first
    for (let i = 0; i < fileLines.length; i++) {
      if (this.normalizeLineForMatching(fileLines[i]) === normalizedContext) {
        console.log(`    → Found exact header match at line ${i + 1}: "${fileLines[i].trim()}"`);
        return i + 1; // Return position after the header line
      }
    }
    
    // Try partial match
    for (let i = 0; i < fileLines.length; i++) {
      if (this.normalizeLineForMatching(fileLines[i]).includes(normalizedContext)) {
        console.log(`    → Found partial header match at line ${i + 1}: "${fileLines[i].trim()}"`);
        return i + 1; // Return position after the header line
      }
    }
    
    console.log(`    → Header anchor not found, using start of file`);
    return 0;
  }
  
  isContextOnlyHunk(operations) {
    // Check if hunk contains only context lines (no additions or removals)
    return operations.every(op => op.type === 'context');
  }
  
  applyHunk(fileLines, hunk) {
    const result = [...fileLines];
    
    // Check if this is a context-only hunk (no actual changes)
    if (this.isContextOnlyHunk(hunk.operations)) {
      console.log(`    → Context-only hunk detected - skipping (no changes to apply)`);
      return { result, success: true, skipped: true };
    }
    
    // Find anchor position using header context
    const anchorPos = this.findAnchor(result, hunk.headerContext);
    
    // Special handling for hunks with no context lines (pure additions)
    const contextOperations = hunk.operations.filter(op => op.type === 'context');
    const addOperations = hunk.operations.filter(op => op.type === 'add');
    const removeOperations = hunk.operations.filter(op => op.type === 'remove');
    
    // If no context and no removals, this is a pure addition at the anchor position
    if (contextOperations.length === 0 && removeOperations.length === 0 && addOperations.length > 0) {
      console.log(`    → Pure addition hunk: inserting ${addOperations.length} lines at anchor position ${anchorPos + 1}`);
      
      for (let i = addOperations.length - 1; i >= 0; i--) {
        result.splice(anchorPos, 0, addOperations[i].line);
      }
      
      return { result, success: true, skipped: false };
    }
    
    // Find all possible context matches using actual file content
    const matches = this.findAllContextMatches(result, hunk.operations, anchorPos);
    
    if (matches.length === 0) {
      console.log(`    ✗ No context matches found, skipping hunk`);
      return { result, success: false, skipped: false, errorReason: 'No context matches found' };
    }
    
    // Try the best match first - should succeed most of the time now
    const bestMatch = matches[0];
    console.log(`    → Trying best context match at line ${bestMatch.startPos + 1}`);
    
    const attemptResult = this.attemptApplyHunk(result, hunk.operations, bestMatch.startPos);
    if (attemptResult.success) {
      return { ...attemptResult, skipped: false };
    }
    
    // If the best match failed, try the others (but don't spam the logs)
    if (matches.length > 1) {
      // console.log(`    → Trying ${matches.length - 1} other matches...`);
      for (let i = 1; i < matches.length; i++) {
        const match = matches[i];
        const attemptResult = this.attemptApplyHunk(result, hunk.operations, match.startPos);
        if (attemptResult.success) {
          console.log(`    ✓ Alternative match at line ${match.startPos + 1} succeeded`);
          return { ...attemptResult, skipped: false };
        }
      }
    }
    
    console.log(`    ✗ No valid context match found that allows successful application`);
    return { result, success: false, skipped: false, errorReason: 'All context matches failed during application' };
  }
  
  attemptApplyHunk(fileLines, operations, startPos) {
    const result = [...fileLines];
    let currentPos = startPos;
    let appliedChanges = 0;
    
    // console.log(`    → Starting application at line ${startPos + 1}, processing ${operations.length} operations`);
    
    // Process operations in sequence - this is crucial for correctness
    for (let opIndex = 0; opIndex < operations.length; opIndex++) {
      const operation = operations[opIndex];
      
      if (operation.type === 'context') {
        const expectedLine = this.normalizeLineForMatching(operation.line);
        
        // console.log(`    → Op ${opIndex + 1}: Context "${expectedLine}" (from pos ${currentPos + 1})`);
        
        // Context lines help us stay synchronized - find the next occurrence
        let found = false;
        for (let searchPos = currentPos; searchPos < Math.min(result.length, currentPos + 10); searchPos++) {
          if ((typeof result[searchPos] === 'string') && this.normalizeLineForMatching(result[searchPos]) === expectedLine) {
            // console.log(`    → Found context at line ${searchPos + 1}: "${result[searchPos].trim()}"`);
            currentPos = searchPos + 1;
            found = true;
            break;
          }
        }
        
        if (!found) {
          // Try looking backwards a bit too
          for (let searchPos = Math.max(0, currentPos - 3); searchPos < currentPos; searchPos++) {
            if (result[searchPos] && this.normalizeLineForMatching(result[searchPos]) === expectedLine) {
              // console.log(`    → Found context (backwards) at line ${searchPos + 1}: "${result[searchPos].trim()}"`);
              currentPos = searchPos + 1;
              found = true;
              break;
            }
          }
        }
        
        if (!found) {
          // console.log(`    → Context not found: "${expectedLine}"`);
          return { result: fileLines, success: false, errorReason: `Context line not found: "${operation.line.trim()}"` };
        }
      }
      else if (operation.type === 'remove') {
        const expectedLine = this.normalizeLineForMatching(operation.line);
        
        // console.log(`    → Op ${opIndex + 1}: Remove "${expectedLine}" (from pos ${currentPos + 1})`);
        
        // For removals, be more precise - look in a smaller range and prefer forward direction
        let found = false;
        
        // Look forward first (more likely to be in the right sequence)
        for (let searchPos = currentPos; searchPos < Math.min(result.length, currentPos + 5); searchPos++) {
          if ((typeof result[searchPos] === 'string') && this.normalizeLineForMatching(result[searchPos]) === expectedLine) {
            // console.log(`    → Removing line ${searchPos + 1}: "${result[searchPos].trim()}"`);
            result.splice(searchPos, 1);
            currentPos = searchPos; // Stay at same position since we removed a line
            found = true;
            appliedChanges++;
            break;
          }
        }
        
        // If not found forward, try looking back a little
        if (!found) {
          for (let searchPos = Math.max(0, currentPos - 2); searchPos < currentPos; searchPos++) {
            if (result[searchPos] && this.normalizeLineForMatching(result[searchPos]) === expectedLine) {
              // console.log(`    → Removing line (backwards) ${searchPos + 1}: "${result[searchPos].trim()}"`);
              result.splice(searchPos, 1);
              currentPos = searchPos; // Adjust position since we removed a line before current pos
              found = true;
              appliedChanges++;
              break;
            }
          }
        }
        
        if (!found) {
          // console.log(`    → Removal not found: "${expectedLine}"`);
          return { result: fileLines, success: false, errorReason: `Line to remove not found: "${operation.line.trim()}"` };
        }
      }
      else if (operation.type === 'add') {
        // console.log(`    → Op ${opIndex + 1}: Add "${operation.line}" at pos ${currentPos + 1}`);
        result.splice(currentPos, 0, operation.line);
        currentPos++;
        appliedChanges++;
      }
    }
    
    console.log(`    → Application complete: ${appliedChanges} changes applied`);
    const success = appliedChanges > 0;
    return { result, success };
  }

  ensureDirectoryExists(filePath) {
    const directory = path.dirname(filePath);
    if (!fs.existsSync(directory)) {
      console.log(`  → Creating directory: ${directory}`);
      fs.mkdirSync(directory, { recursive: true });
    }
  }
  
  sortHunksByLineNumber(hunks) {
    // Sort hunks in descending order by line number (bottom to top)
    // Line numbers are ONLY used for ordering, not for positioning!
    // Actual position is found through context matching.
    return [...hunks].sort((a, b) => {
      if (a.lineNumber === undefined && b.lineNumber === undefined) return 0;
      if (a.lineNumber === undefined) return 1; // Put undefined line numbers last for descending sort
      if (b.lineNumber === undefined) return -1;
      return b.lineNumber - a.lineNumber; // Descending order (bottom to top)
    });
  }

  displaySummary(results) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`DIFF APPLICATION SUMMARY`);
    console.log(`${'='.repeat(80)}`);
    
    if (results.length === 0) {
      console.log('No files processed.');
      return;
    }
    
    // Calculate stats
    const successful = results.filter(r => r.status === 'SUCCESS').length;
    const created = results.filter(r => r.status === 'CREATED').length;
    const failed = results.filter(r => r.status === 'FAILED').length;
    const totalSkipped = results.reduce((sum, r) => sum + r.hunksSkipped, 0);
    
    console.log(`\nOverall Results:`);
    console.log(`  ✓ Success: ${successful} files`);
    console.log(`  ➕ Created: ${created} files`);
    console.log(`  ✗ Failed:  ${failed} files`);
    console.log(`  📊 Total:   ${results.length} files`);
    if (totalSkipped > 0) {
      console.log(`  ⏭ Skipped: ${totalSkipped} context-only hunks`);
    }
    
    // Display detailed table
    console.log(`\nDetailed Results:`);
    console.log(`${'─'.repeat(80)}`);
    
    // Table headers
    const statusCol = 8;
    const hunksCol = 12;
    const fileCol = 46;
    
    console.log(
      'STATUS'.padEnd(statusCol) + 
      'HUNKS'.padEnd(hunksCol) + 
      'FILE'.padEnd(fileCol)
    );
    console.log(`${'─'.repeat(80)}`);
    
    // Sort results: successful first, then created, then failed
    const sortedResults = [...results].sort((a, b) => {
      const statusOrder = { 'SUCCESS': 0, 'CREATED': 1, 'FAILED': 2 };
      return statusOrder[a.status] - statusOrder[b.status];
    });
    
    for (const result of sortedResults) {
      const statusIcon = {
        'SUCCESS': '✓',
        'CREATED': '➕',
        'FAILED': '✗'
      }[result.status];
      
      const statusText = `${statusIcon} ${result.status}`;
      let hunksText = `${result.hunksApplied}/${result.totalHunks}`;
      if (result.hunksSkipped > 0) {
        hunksText += ` (${result.hunksSkipped} skip)`;
      }
      const fileName = result.filename.length > fileCol - 3 ? 
        '...' + result.filename.slice(-(fileCol - 6)) : 
        result.filename;
      
      console.log(
        statusText.padEnd(statusCol) + 
        hunksText.padEnd(hunksCol) + 
        fileName.padEnd(fileCol)
      );
      
      // Show error details for failed files
      if (result.status === 'FAILED' && result.error) {
        console.log(''.padEnd(statusCol + hunksCol) + `  └─ ${result.error}`);
      }
    }
    
    console.log(`${'─'.repeat(80)}`);
    
    // Show failed files summary if any
    const failedFiles = results.filter(r => r.status === 'FAILED');
    if (failedFiles.length > 0) {
      console.log(`\n❌ FAILED FILES (${failedFiles.length}):`);
      for (const failed of failedFiles) {
        console.log(`   • ${failed.filename}`);
        console.log(`     └─ ${failed.error || 'Unknown error'}`);
        console.log(`     └─ Path: ${failed.targetPath}`);
        
        // Show specific failed hunks if available
        if (failed.failedHunks && failed.failedHunks.length > 0) {
          console.log(`     └─ Failed hunks:`);
          for (const failedHunk of failed.failedHunks) {
            let hunkDesc = '';
            
            if (failedHunk.lineNumber && failedHunk.headerContext) {
              hunkDesc = `@@ -${failedHunk.lineNumber},... +${failedHunk.lineNumber},... @@ ${failedHunk.headerContext}`;
            } else if (failedHunk.lineNumber) {
              hunkDesc = `@@ -${failedHunk.lineNumber},... +${failedHunk.lineNumber},... @@`;
            } else if (failedHunk.headerContext) {
              hunkDesc = `@@ ... @@ ${failedHunk.headerContext}`;
            } else {
              hunkDesc = `Hunk #${failedHunk.hunkIndex + 1}`;
            }
            
            console.log(`        • ${hunkDesc}`);
            console.log(`          └─ ${failedHunk.reason}`);
          }
        }
      }
    }
    
    console.log(`\n${'='.repeat(80)}`);
    
    if (failed > 0) {
      console.log(`⚠️  ${failed} file(s) failed to apply. Check the errors above.`);
    } else {
      console.log(`🎉 All files processed successfully!`);
    }
    
    if (totalSkipped > 0) {
      console.log(`ℹ️  ${totalSkipped} context-only hunks were skipped (no changes needed).`);
    }
    
    console.log(`${'='.repeat(80)}`);
  }

  applyDiff(diffPath) {
    console.log(`Applying diff from: ${diffPath}`);
    
    const diffContent = fs.readFileSync(diffPath, 'utf-8');
    const fileChanges = this.parseDiff(diffContent);
    
    console.log(`Found ${fileChanges.length} file(s) to process`);
    
    const results = [];
    
    for (const fileChange of fileChanges) {
      let { filename, hunks, isNewFile } = fileChange;
      // console.log("filename", filename);

  if (filename.startsWith('Documents'))
      filename = '/' + filename;
      
      // Handle absolute vs relative paths correctly
      let targetPath;
      if (path.isAbsolute(filename)) {
        // console.log("path.isAbsolute(filename)", path.isAbsolute(filename))
        // If filename is already absolute, use it as-is
        targetPath = path.join(os.homedir(), filename);
        // console.log(`\nUsing absolute path: ${filename}`);
      } else {
        // Check if current working directory already contains part of the filename path
        const cwd = process.cwd();
        const normalizedFilename = filename.replace(/\\/g, '/'); // Normalize separators
        
        // Split both paths into segments for comparison
        const cwdSegments = cwd.split(path.sep);
        const fileSegments = normalizedFilename.split('/');
        
        // Find if there's an overlap between the end of cwd and start of filename
        let overlapLength = 0;
        for (let i = 1; i <= Math.min(cwdSegments.length, fileSegments.length); i++) {
          const cwdSuffix = cwdSegments.slice(-i);
          const fileSuffix = fileSegments.slice(0, i);
          
          if (JSON.stringify(cwdSuffix) === JSON.stringify(fileSuffix)) {
            overlapLength = i;
          }
        }
        
        if (overlapLength > 0) {
          // Remove the overlapping part from filename and resolve relative to cwd
          const remainingPath = fileSegments.slice(overlapLength).join('/');
          targetPath = remainingPath ? path.resolve(cwd, remainingPath) : cwd;
          console.log(`\nDetected path overlap (${overlapLength} segments), using: ${filename} → ${remainingPath} → ${targetPath}`);
        } else {
          // No overlap, resolve relative to diff file directory  
          targetPath = path.resolve(path.dirname(diffPath), filename);
          console.log(`\nResolving relative path: ${filename} → ${targetPath}`);
        }
      }
      
      if (isNewFile) {
        console.log(`Creating new file: ${filename} (${hunks.length} hunks)`);
        
        try {
          this.ensureDirectoryExists(targetPath);
          
          if (fs.existsSync(targetPath)) {
            console.log(`  ⚠ File already exists: ${targetPath}, will overwrite`);
          }
          
          const { result, success } = this.createNewFile([], hunks);
          
          if (success && result.length > 0) {
            const newContent = result.join('\n') + '\n';
            fs.writeFileSync(targetPath, newContent);
            console.log(`  ✓ New file created with ${result.length} lines`);
            results.push({
              filename,
              status: 'CREATED',
              hunksApplied: hunks.length,
              totalHunks: hunks.length,
              hunksSkipped: 0,
              targetPath
            });
          } else {
            console.log(`  ✗ No content to write for new file`);
            results.push({
              filename,
              status: 'FAILED',
              hunksApplied: 0,
              totalHunks: hunks.length,
              hunksSkipped: 0,
              error: 'No content to write',
              targetPath
            });
          }
          
        } catch (error) {
          const errorMsg = `Failed to create new file: ${(error).message}`;
          console.error(`  ✗ ${errorMsg}`);
          results.push({
            filename,
            status: 'FAILED',
            hunksApplied: 0,
            totalHunks: hunks.length,
            hunksSkipped: 0,
            error: errorMsg,
            targetPath
          });
        }
      } else {
        console.log(`Processing existing file: ${filename} (${hunks.length} hunks)`);
        
        try {
          if (!fs.existsSync(targetPath)) {
            const errorMsg = `File not found: ${targetPath}`;
            console.error(`  ✗ ${errorMsg}`);
            results.push({
              filename,
              status: 'FAILED',
              hunksApplied: 0,
              totalHunks: hunks.length,
              hunksSkipped: 0,
              error: errorMsg,
              targetPath
            });
            continue;
          }
          
          const originalContent = fs.readFileSync(targetPath, 'utf-8');
          let fileLines = originalContent.split('\n');
          
          // Sort hunks from bottom to top for more reliable application
          // (Line numbers used ONLY for ordering, actual positions found via context)
          const sortedHunks = this.sortHunksByLineNumber(hunks);
          console.log(`  → Applying hunks in bottom-to-top order (by line number)`);
          
          let successfulHunks = 0;
          let failedHunks = 0;
          let skippedHunks = 0;
          const failedHunkDetails = [];
          
          // Apply hunks sequentially (bottom to top order, positions found by context)
          for (let i = 0; i < sortedHunks.length; i++) {
            const hunk = sortedHunks[i];
            const hunkLabel = hunk.lineNumber ? `@${hunk.lineNumber}` : `#${i + 1}`;
            
            console.log(`  → Applying hunk ${hunkLabel} (position found by context matching)`);
            const { result, success, skipped, errorReason } = this.applyHunk(fileLines, hunk);
            
            if (skipped) {
              console.log(`  ⏭ Hunk ${hunkLabel} skipped (context-only, no changes)`);
              skippedHunks++;
            } else if (success) {
              fileLines = result;
              console.log(`  ✓ Hunk ${hunkLabel} applied successfully`);
              successfulHunks++;
            } else {
              console.log(`  ✗ Hunk ${hunkLabel} failed`);
              failedHunks++;
              
              // Record details about the failed hunk
              failedHunkDetails.push({
                hunkIndex: i,
                lineNumber: hunk.lineNumber,
                headerContext: hunk.headerContext,
                reason: errorReason || 'Unknown error'
              });
            }
          }
          
          // Only write file if ALL non-skipped hunks were successful
          if (failedHunks === 0 && (successfulHunks > 0 || skippedHunks > 0)) {
            const hasTrailingNewline = originalContent.endsWith('\n');
            const modifiedContent = fileLines.join('\n') + (hasTrailingNewline ? '\n' : '');
            
            fs.writeFileSync(targetPath, modifiedContent);
            console.log(`  ✓ File updated successfully (${successfulHunks}/${hunks.length} hunks applied, ${skippedHunks} skipped)`);
            results.push({
              filename,
              status: 'SUCCESS',
              hunksApplied: successfulHunks,
              totalHunks: hunks.length,
              hunksSkipped: skippedHunks,
              targetPath
            });
          } else if (failedHunks > 0) {
            console.log(`  ✗ File NOT updated due to failed hunks (${failedHunks}/${hunks.length} failed)`);
            console.log(`    → All hunks must succeed for file to be modified`);
            results.push({
              filename,
              status: 'FAILED',
              hunksApplied: successfulHunks,
              totalHunks: hunks.length,
              hunksSkipped: skippedHunks,
              error: `${failedHunks} hunk(s) failed to apply`,
              targetPath,
              failedHunks: failedHunkDetails
            });
          } else {
            console.log(`  ⚠ No changes applied to ${filename}`);
            results.push({
              filename,
              status: 'FAILED',
              hunksApplied: 0,
              totalHunks: hunks.length,
              hunksSkipped: skippedHunks,
              error: 'No changes applied',
              targetPath
            });
          }
          
        } catch (error) {
          const errorMsg = `Failed to process file: ${(error).message}`;
          console.error(`  ✗ ${errorMsg}`);
          results.push({
            filename,
            status: 'FAILED',
            hunksApplied: 0,
            totalHunks: hunks.length,
            hunksSkipped: 0,
            error: errorMsg,
            targetPath
          });
        }
      }
    }
    
    // Display summary
    this.displaySummary(results);
  }
}

module.exports = { DiffApplier };