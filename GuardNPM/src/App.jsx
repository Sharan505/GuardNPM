import { BrowserRouter as Router, Routes, Route, Navigate, Link } from "react-router-dom";
import Login from "./Components/Login";
import Register from "./Components/Register";
import { ShieldCheck, ArrowRight, UploadCloud, FileArchive, LogOut, AlertTriangle, CheckCircle, Info, Loader2, Folder, File, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import maliciousPackageData from "./data/malicious_npm_packages.json";
import { extractPackageJsonFromTgz, analyzePackageJson, extractFileListFromTgz } from "./utils/analyzer";

function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [analysisResults, setAnalysisResults] = useState([]);
  const [analysisPhase, setAnalysisPhase] = useState('IDLE'); // 'IDLE' | 'L1_LOADING' | 'L1_DONE' | 'L2_LOADING' | 'L2_DONE'
  const [scanDocId, setScanDocId] = useState(null);
  const [fileList, setFileList] = useState([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
      setAnalysisResults([]);
      setAnalysisPhase('IDLE');
      setScanDocId(null);
      setFileList([]);
    }
  };

  const handleLevel1 = async (e) => {
    e.preventDefault();
    if (!file || analysisPhase !== 'IDLE') return;
    
    setAnalysisPhase('L1_LOADING');
    setAnalysisResults([{ 
      id: 'l1-loading',
      type: 'loading', 
      title: 'Executing Level 1 Security Scan...',
      message: 'Checking package against our dataset of known malicious signatures. Please wait.' 
    }]);

    await new Promise(resolve => setTimeout(resolve, 500));

    // First Level Filtration: Check against known malicious packages dataset
    const baseName = file.name.replace(/\.tgz$|\.tar\.gz$/, "");
    let isMalicious = false;
    let maliciousKeyMatched = "";

    if (maliciousPackageData[baseName]) {
      isMalicious = true;
      maliciousKeyMatched = baseName;
    } else {
      const normalizedUploaded = baseName.toLowerCase().replace(/[^a-z0-9]/g, "");
      const keys = Object.keys(maliciousPackageData);
      for (const key of keys) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (normalizedKey.length > 3 && normalizedUploaded.startsWith(normalizedKey)) {
          isMalicious = true;
          maliciousKeyMatched = key;
          break;
        }
      }
    }

    const l1Result = isMalicious 
      ? { 
          id: 'l1-danger',
          type: 'danger', 
          title: 'L1 Security Alert: Signature Hit!',
          message: `The package '${file.name}' matches a known malicious signature ('${maliciousKeyMatched}'). Deployment has been BLOCKED to protect your environment.` 
        }
      : { 
          id: 'l1-success',
          type: 'success', 
          title: 'L1 Analysis Passed (Signature Scan)',
          message: `The package '${file.name}' passed the primary security screen against known malicious datasets.` 
        };

    setAnalysisResults([l1Result]);
    setAnalysisPhase(isMalicious ? 'L2_DONE' : 'L1_DONE');

    // Firestore Integration: Log Level 1 Execution
    try {
      const docRef = await addDoc(collection(db, "package_scans"), {
        userEmail: user?.email || "anonymous",
        fileName: file.name,
        fileSize: file.size,
        isMalicious: isMalicious,
        blockedAtLevel: isMalicious ? 1 : null,
        matchedSignature: isMalicious ? maliciousKeyMatched : null,
        status: isMalicious ? "BLOCKED_L1" : "PASSED_L1_PENDING_L2",
        timestamp: serverTimestamp()
      });
      setScanDocId(docRef.id);
    } catch (err) {
      console.error("Firestore logging error:", err);
    }

    if (!isMalicious) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const list = extractFileListFromTgz(arrayBuffer);
        setFileList(list);
      } catch (err) {
        console.error("File list error:", err);
      }
    } else {
      setFile(null);
      return;
    }
  };

  const handleLevel2 = async () => {
    setAnalysisPhase('L2_LOADING');
    setAnalysisResults(prev => [
      ...prev,
      {
        id: 'l2-loading',
        type: 'loading',
        title: 'Executing Level 2 Scan...',
        message: 'Decompressing package and analyzing package.json for anomalous lifecycle scripts and obfuscated payloads.'
      }
    ]);

    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pkg = extractPackageJsonFromTgz(arrayBuffer);

      if (!pkg) {
        setAnalysisResults(prev => [
          ...prev.filter(r => r.id !== 'l2-loading'),
          {
            id: 'l2-warning',
            type: 'warning',
            title: 'L2 Warning: Parsing Error',
            message: `Failed to locate or read package.json. The package may be corrupted or obfuscating its structure. Proceed with caution.`,
          }
        ]);
        setAnalysisPhase('L2_DONE');
        
        // Log parse failure
        if (scanDocId) {
          updateDoc(doc(db, "package_scans", scanDocId), {
            status: "FAILED_L2_PARSE"
          }).catch(e => console.error(e));
        }

        return;
      }

      const issues = analyzePackageJson(pkg);
      const hasCritical = issues.some(i => i.level === 'critical' || i.level === 'high');

      const l2Result = issues.length > 0 
        ? {
            id: 'l2-result',
            type: hasCritical ? 'danger' : 'warning',
            title: hasCritical ? 'L2 Alert: Dangerous Metadata Payload' : 'L2 Notice: Suspicious Metadata',
            message: `Level 2 structural analysis identified risks in package.json.`,
            issues: issues
          }
        : { 
            id: 'l2-result',
            type: 'success', 
            title: 'L2 Analysis Passed (Structural Metadata)',
            message: `No malicious signatures were matched, and structural metadata checks show no dangerous scripts or anomalous dependencies.` 
          };
      
      setAnalysisResults(prev => [...prev.filter(r => r.id !== 'l2-loading'), l2Result]);

      // Firestore Integration: Update Document with Level 2 Execution Results
      if (scanDocId) {
        try {
          await updateDoc(doc(db, "package_scans", scanDocId), {
            isMalicious: hasCritical,
            hasSuspiciousMetadata: issues.length > 0,
            blockedAtLevel: hasCritical ? 2 : null,
            issuesFound: issues.map(i => `${i.level.toUpperCase()}: ${i.type}`),
            status: hasCritical ? "BLOCKED_L2" : (issues.length > 0 ? "WARNING_L2" : "SAFE_PASSED_ALL_L2")
          });
        } catch (err) {
          console.error("Firestore logging error:", err);
        }
      }

    } catch (err) {
      setAnalysisResults(prev => [
        ...prev.filter(r => r.id !== 'l2-loading'),
        {
          id: 'error',
          type: 'danger',
          title: 'Analysis Critical Failure',
          message: `An unexpected system error occurred during extraction: ${err.message}`
        }
      ]);
      // If extraction fails, log it to Firestore
      if (scanDocId) {
        updateDoc(doc(db, "package_scans", scanDocId), {
          status: "FAILED_EXTRACTION",
          errorMessage: err.message
        }).catch(e => console.error("Firestore error:", e));
      }
    }

    setAnalysisPhase('L2_DONE');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-slate-950 text-slate-200">
        {/* Navbar */}
        <nav className="border-b border-slate-800/60 bg-slate-900/50 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center ring-1 ring-white/10 shadow-lg shadow-indigo-500/20">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
            </div>
            <span className="font-bold text-xl bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">GuardNPM</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm font-medium text-slate-400 hidden sm:block">
              {user.email}
            </div>
            <button 
              onClick={handleLogout}
              className="px-4 py-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-sm font-medium rounded-xl flex items-center gap-2 transition-all text-red-400 hover:text-red-300"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </nav>

        {/* Dynamic Background */}
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-indigo-600/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none"></div>

        {/* Main Content */}
        <main className="w-full max-w-[100rem] mx-auto p-4 md:p-6 lg:p-8 pt-12 relative z-10">
          <div className="mb-14 text-center">
            <h1 className="text-4xl md:text-5xl font-extrabold mb-6 text-white tracking-tight">
              Analyze Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">NPM Package</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
              GuardNPM is an advanced package analyzer that inspects your <code className="bg-slate-800 px-2 py-1 rounded text-indigo-300 text-sm border border-slate-700">.tgz</code> files for potential malware, security vulnerabilities, hidden exploits, and compliance issues before you deploy them to production.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
            {/* LEFT: File Structure Details */}
            <div className="lg:col-span-3 order-2 lg:order-1 h-[60vh] xl:h-[70vh]">
              {(analysisPhase === 'L1_DONE' || analysisPhase === 'L2_LOADING' || analysisPhase === 'L2_DONE') && fileList.length > 0 && (
                <div className="h-full flex flex-col backdrop-blur-xl bg-slate-900/40 border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-left-4 duration-500">
                  <div className="p-4 border-b border-slate-700/50 bg-slate-800/30">
                    <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                      <FileArchive className="w-5 h-5 text-indigo-400" />
                      Package Contents
                    </h3>
                  </div>
                  <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
                    <ul className="space-y-1">
                      {fileList.map((f, i) => (
                         <li key={i} className="flex flex-col py-1">
                           <div className="flex items-center gap-2 group">
                             {f.isDirectory ? (
                               <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                             ) : f.name.endsWith('package.json') ? (
                               <FileText className="w-4 h-4 text-green-400 shrink-0" />
                             ) : (
                               <File className="w-4 h-4 text-slate-400 shrink-0" />
                             )}
                             <span className={`text-sm break-all ${f.isDirectory ? 'text-slate-300 font-medium' : 'text-slate-400'}`}>
                               {f.name}
                             </span>
                           </div>
                         </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* CENTER: Upload component */}
            <div className="lg:col-span-6 max-w-xl w-full mx-auto order-1 lg:order-2">
              <div className="backdrop-blur-xl bg-slate-900/40 border border-slate-700/50 p-8 rounded-3xl shadow-2xl transition-all duration-300">
                <form onSubmit={handleLevel1} className="flex flex-col items-center">
                  <div className="w-full relative group">
                    <input 
                      type="file" 
                      accept=".tgz,application/gzip"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      required
                    />
                    <div className={`p-10 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center transition-all duration-300 bg-slate-800/30 ${file ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-slate-600 hover:border-indigo-400/50 group-hover:bg-slate-800/60'}`}>
                      {file ? (
                        <>
                          <FileArchive className="w-12 h-12 text-indigo-400 mb-4" />
                          <p className="font-medium text-white text-lg break-all">{file.name}</p>
                          <p className="text-sm text-slate-400 mt-1">{(file.size / 1024).toFixed(2)} KB</p>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="w-12 h-12 text-slate-400 mb-4 group-hover:text-indigo-400 transition-transform group-hover:-translate-y-1" />
                          <p className="font-medium text-slate-300 text-lg">Click or drag package to upload</p>
                          <p className="text-sm text-slate-500 mt-2">Strictly requires .tgz (NPM Package Archive)</p>
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!file || analysisPhase !== 'IDLE'}
                    className="w-full mt-8 py-4 px-6 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 group transition-all shadow-lg shadow-indigo-500/25 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    {analysisPhase === 'IDLE' ? 'Start Security Analysis' : 'Analysis In Progress / Completed'}
                    {analysisPhase === 'IDLE' && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
                  </button>
                </form>

                {analysisPhase === 'L1_DONE' && (
                  <div className="flex justify-center mt-6 animate-in fade-in zoom-in duration-500 relative z-20">
                    <button 
                      onClick={handleLevel2}
                      className="w-full py-4 px-6 bg-slate-800/80 hover:bg-slate-700/90 border-2 border-slate-600 hover:border-indigo-500 text-indigo-400 hover:text-indigo-300 font-bold rounded-xl flex items-center justify-center gap-3 group transition-all shadow-lg hover:shadow-indigo-500/20"
                    >
                      Proceed to Level 2 Analysis
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: Analysis Results Stacked */}
            <div className="lg:col-span-3 order-3 h-[60vh] xl:h-[70vh]">
              {analysisResults.length > 0 && (
                <div className="h-full flex flex-col space-y-4 overflow-y-auto custom-scrollbar pr-2">
                  {analysisResults.map((result) => (
                    <div key={result.id} className={`p-4 rounded-2xl border flex flex-col gap-3 transition-all animate-in fade-in slide-in-from-right-4 duration-300 ${
                      result.type === 'danger' 
                        ? 'bg-red-500/10 border-red-500/50 shadow-lg shadow-red-500/20' 
                        : result.type === 'warning' 
                          ? 'bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/20'
                          : result.type === 'loading'
                            ? 'bg-indigo-500/10 border-indigo-500/50 shadow-lg shadow-indigo-500/20'
                            : 'bg-emerald-500/10 border-emerald-500/50 shadow-lg shadow-emerald-500/20'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-full shrink-0 ${
                          result.type === 'danger' ? 'bg-red-500/20 text-red-500' 
                          : result.type === 'warning' ? 'bg-amber-500/20 text-amber-500'
                          : result.type === 'loading' ? 'bg-indigo-500/20 text-indigo-400'
                          : 'bg-emerald-500/20 text-emerald-500'
                        }`}>
                          {result.type === 'danger' ? <AlertTriangle className="w-5 h-5" /> 
                            : result.type === 'warning' ? <Info className="w-5 h-5" />
                            : result.type === 'loading' ? <Loader2 className="w-5 h-5 animate-spin" />
                            : <CheckCircle className="w-5 h-5" />
                          }
                        </div>
                        <div className="w-full">
                          <h3 className={`text-base font-bold mb-1 ${
                            result.type === 'danger' ? 'text-red-400' 
                            : result.type === 'warning' ? 'text-amber-400'
                            : result.type === 'loading' ? 'text-indigo-400'
                            : 'text-emerald-400'
                          }`}>
                            {result.title}
                          </h3>
                        </div>
                      </div>
                      
                      <div className="w-full px-1">
                        <p className="text-slate-300 leading-relaxed text-sm">
                          {result.message}
                        </p>
                        
                        {/* Issue List Display */}
                        {result.issues && result.issues.length > 0 && (
                          <div className="mt-3 space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                            {result.issues.map((issue, idx) => (
                              <div key={idx} className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/50 shadow-inner flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                                    issue.level === 'critical' ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                                      : issue.level === 'high' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                      : issue.level === 'medium' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30'
                                      : 'bg-slate-700 text-slate-300'
                                  }`}>
                                    {issue.level}
                                  </span>
                                  <span className="text-[10px] uppercase font-medium text-slate-500 tracking-wider truncate">
                                    {issue.type.replace('-', ' ')}
                                  </span>
                                </div>
                                <p className="font-medium text-slate-200 text-xs mt-1 leading-snug">{issue.message}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-slate-950">
      <div className="absolute top-[20%] left-[20%] w-[30%] h-[30%] bg-purple-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-[20%] right-[20%] w-[30%] h-[30%] bg-blue-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none animate-pulse" style={{ animationDelay: "1s" }}></div>
      
      <div className="w-full max-w-2xl p-8 relative z-10 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 mb-8 ring-1 ring-white/10 shadow-2xl shadow-indigo-500/20">
          <ShieldCheck className="w-10 h-10 text-indigo-400" />
        </div>
        
        <h1 className="text-5xl md:text-6xl font-extrabold bg-gradient-to-br from-white via-slate-200 to-slate-500 bg-clip-text text-transparent mb-6 tracking-tight">
          Welcome to GuardNPM
        </h1>
        
        <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-xl mx-auto leading-relaxed">
          Secure, manage, and monitor your node packages with enterprise-grade protection and analytics.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/register"
            className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 group transition-all shadow-lg shadow-blue-600/25 cursor-pointer active:scale-[0.98]"
          >
            Get Started
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            to="/login"
            className="w-full sm:w-auto px-8 py-3.5 bg-slate-800/50 hover:bg-slate-700/60 border border-slate-700/50 text-white rounded-xl font-semibold flex items-center justify-center transition-all cursor-pointer active:scale-[0.98] backdrop-blur-md"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
