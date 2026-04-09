import { gunzipSync } from 'fflate';

export function extractFileListFromTgz(arrayBuffer) {
  const files = [];
  try {
    const tarBuffer = gunzipSync(new Uint8Array(arrayBuffer));
    let offset = 0;
    while (offset < tarBuffer.length) {
      if (tarBuffer[offset] === 0 && tarBuffer[offset + 1] === 0) break;

      const filenameChars = [];
      for (let i = 0; i < 100; i++) {
        if (tarBuffer[offset + i] === 0) break;
        filenameChars.push(String.fromCharCode(tarBuffer[offset + i]));
      }
      const filename = filenameChars.join('');

      const sizeStrChars = [];
      for (let i = 0; i < 12; i++) {
        if (tarBuffer[offset + 124 + i] === 0 || tarBuffer[offset + 124 + i] === 32) break;
        sizeStrChars.push(String.fromCharCode(tarBuffer[offset + 124 + i]));
      }
      const sizeStr = sizeStrChars.join('').trim();
      const fileSize = parseInt(sizeStr, 8);

      if (filename) {
        files.push({
          name: filename,
          size: isNaN(fileSize) ? 0 : fileSize,
          isDirectory: filename.endsWith('/') || tarBuffer[offset + 156] === 53
        });
      }

      if (isNaN(fileSize)) break;
      offset += 512 + Math.ceil(fileSize / 512) * 512;
    }
  } catch (error) {
    console.error("Extraction list error:", error);
  }
  return files;
}

/**
 * Parses a basic TAR file array buffer to find and extract `package/package.json`.
 */
export function extractPackageJsonFromTgz(arrayBuffer) {
  try {
    const compressed = new Uint8Array(arrayBuffer);
    const tarBuffer = gunzipSync(compressed);
    
    // Parse the TAR format
    let offset = 0;
    while (offset < tarBuffer.length) {
      if (tarBuffer[offset] === 0 && tarBuffer[offset + 1] === 0) {
        break; // End of tar archive
      }

      // Read filename (100 bytes)
      const filenameChars = [];
      for (let i = 0; i < 100; i++) {
        if (tarBuffer[offset + i] === 0) break;
        filenameChars.push(String.fromCharCode(tarBuffer[offset + i]));
      }
      const filename = filenameChars.join('');

      // Read file size (12 bytes octal string)
      const sizeStrChars = [];
      for (let i = 0; i < 12; i++) {
        if (tarBuffer[offset + 124 + i] === 0 || tarBuffer[offset + 124 + i] === 32) break;
        sizeStrChars.push(String.fromCharCode(tarBuffer[offset + 124 + i]));
      }
      const sizeStr = sizeStrChars.join('').trim();
      const fileSize = parseInt(sizeStr, 8);

      // Checking for package.json (usually under package/ dir in tgz)
      if (filename === 'package/package.json' || filename === 'package.json' || filename.endsWith('/package.json')) {
        const contentStart = offset + 512;
        const fileBytes = tarBuffer.slice(contentStart, contentStart + fileSize);
        
        const contentStr = new TextDecoder('utf-8').decode(fileBytes);
        return JSON.parse(contentStr);
      }

      if (isNaN(fileSize)) break;
      offset += 512 + Math.ceil(fileSize / 512) * 512;
    }
  } catch (error) {
    console.error("Extraction error:", error);
    return null;
  }
  return null;
}

export function analyzePackageJson(pkg) {
  const issues = [];
  
  // 1. Check for suspicious scripts
  if (pkg.scripts) {
    const lifecycleScripts = ['preinstall', 'postinstall', 'install', 'preuninstall', 'postuninstall'];
    for (const scriptName of lifecycleScripts) {
      if (pkg.scripts[scriptName]) {
        issues.push({
          level: 'high',
          type: 'lifecycle-script',
          message: `Suspicious lifecycle script found: "${scriptName}". These run automatically during install without user interaction.`
        });
      }
    }

    // 2. Check for obfuscated commands
    const obfuscatedPatterns = [
      { regex: /node\s+-e\s+["']eval\(/i, desc: 'node -e "eval(...)"' },
      { regex: /curl.*\|\s*(bash|sh)/i, desc: 'curl | bash' },
      { regex: /wget.*\|\s*(bash|sh)/i, desc: 'wget | sh' },
      { regex: /base64\s+-d/i, desc: 'base64 decoding' },
      { regex: /Buffer\.from\(/i, desc: 'Buffer.from (commonly used for hex/base64 obfuscation)' },
    ];

    for (const [scriptName, scriptContent] of Object.entries(pkg.scripts)) {
      for (const pattern of obfuscatedPatterns) {
        if (pattern.regex.test(scriptContent)) {
          issues.push({
            level: 'critical',
            type: 'obfuscated-command',
            message: `Dangerous command detected in script "${scriptName}": Pattern matches "${pattern.desc}"`
          });
        }
      }
    }
  }

  // 3. Check for weird dependencies
  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {})
  };

  const weirdRegex = /(0day|1day|hack|exploit|\d{4,})/i; 
  for (const dep of Object.keys(allDeps)) {
    // Unusually long unhyphenated words
    if (dep.length > 20 && !dep.includes('-') && !dep.includes('@')) {
      issues.push({
        level: 'medium',
        type: 'weird-dependency',
        message: `Unusually long un-hyphenated dependency name: "${dep}"`
      });
    }
    // Typo/suspicious patterns
    if (weirdRegex.test(dep)) {
      issues.push({
        level: 'medium',
        type: 'weird-dependency',
        message: `Suspicious dependency name (potential typosquatting/malicious): "${dep}"`
      });
    }
  }

  return issues;
}

export function extractCodeFilesFromTgz(arrayBuffer) {
  const extractedFiles = [];
  try {
    const compressed = new Uint8Array(arrayBuffer);
    const tarBuffer = gunzipSync(compressed);
    
    let offset = 0;
    while (offset < tarBuffer.length) {
      if (tarBuffer[offset] === 0 && tarBuffer[offset + 1] === 0) break;

      const filenameChars = [];
      for (let i = 0; i < 100; i++) {
        if (tarBuffer[offset + i] === 0) break;
        filenameChars.push(String.fromCharCode(tarBuffer[offset + i]));
      }
      const filename = filenameChars.join('');

      const sizeStrChars = [];
      for (let i = 0; i < 12; i++) {
        if (tarBuffer[offset + 124 + i] === 0 || tarBuffer[offset + 124 + i] === 32) break;
        sizeStrChars.push(String.fromCharCode(tarBuffer[offset + 124 + i]));
      }
      const sizeStr = sizeStrChars.join('').trim();
      const fileSize = parseInt(sizeStr, 8);

      const isCodeFile = filename.endsWith('.js') || filename.endsWith('.ts') || filename.endsWith('.jsx') || filename.endsWith('.tsx') || filename.endsWith('.cjs') || filename.endsWith('.mjs');
      
      const isDirectory = filename.endsWith('/') || tarBuffer[offset + 156] === 53;

      if (!isDirectory && isCodeFile) {
        const contentStart = offset + 512;
        const fileBytes = tarBuffer.slice(contentStart, contentStart + fileSize);
        let contentStr = '';
        try {
          contentStr = new TextDecoder('utf-8').decode(fileBytes);
          extractedFiles.push({ name: filename, content: contentStr });
        } catch (e) {
            // ignore
        }
      }

      if (isNaN(fileSize)) break;
      offset += 512 + Math.ceil(fileSize / 512) * 512;
    }
  } catch (error) {
    console.error("Extraction code error:", error);
  }
  return extractedFiles;
}

export function analyzeCodeForL4(files) {
  const issues = [];
  const secretPatterns = [
    { regex: /(AKIA[0-9A-Z]{16})/g, desc: 'AWS Access Key' },
    { regex: /-----BEGIN PRIVATE KEY-----/g, desc: 'Private Key' },
    { regex: /(?:apikey|api_key|api-key)\s*[:=]\s*['"][a-zA-Z0-9_\-]{10,}['"]/gi, desc: 'Hardcoded API Key' },
    { regex: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{5,}['"]/gi, desc: 'Hardcoded Password' },
    { regex: /sk_live_[0-9a-zA-Z]{24}/g, desc: 'Stripe Secret Key' },
  ];

  for (const file of files) {
    for (const pattern of secretPatterns) {
      if (pattern.regex.test(file.content)) {
         issues.push({
           level: 'high',
           type: 'exposed-secret',
           message: `Exposed ${pattern.desc} found in ${file.name}`
         });
      }
    }
  }
  return issues;
}

export function analyzeCodeForL5(files) {
  const issues = [];
  const dangerousPatterns = [
    { regex: /eval\s*\(/g, desc: 'eval() function usage' },
    { regex: /require\s*\(\s*['"]child_process['"]\s*\)/g, desc: 'child_process import' },
    { regex: /exec\s*\(/g, desc: 'exec() shell command' },
    { regex: /spawn\s*\(/g, desc: 'spawn() shell command' },
    { regex: /String\.fromCharCode/g, desc: 'String.fromCharCode (often used for obfuscation)' }
  ];

  for (const file of files) {
    for (const pattern of dangerousPatterns) {
      if (pattern.regex.test(file.content)) {
         issues.push({
           level: 'critical',
           type: 'dangerous-code',
           message: `Dangerous pattern "${pattern.desc}" detected in ${file.name}`
         });
      }
    }
  }
  return issues;
}
