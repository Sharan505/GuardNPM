import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, query, getDocs, orderBy } from "firebase/firestore";
import { db, auth } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend 
} from "recharts";
import { ShieldAlert, CheckCircle, ShieldCheck, FileArchive, ArrowLeft, LogOut } from "lucide-react";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        navigate("/login");
      } else {
        setUser(currentUser);
        fetchStats();
      }
    });
    return unsubscribe;
  }, [navigate]);

  const fetchStats = async () => {
    try {
      const q = query(collection(db, "package_scans"), orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setScans(data);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Analytics Metrics
  const totalScans = scans.length;
  const safeScans = scans.filter(s => s.status && s.status.includes('SAFE')).length;
  const blockedScans = totalScans - safeScans;

  // Breakdown by Level
  let levelBlocks = { L1: 0, L2: 0, L3: 0, L4: 0, L5: 0 };
  scans.forEach(s => {
    if (s.blockedAtLevel) {
      levelBlocks[`L${s.blockedAtLevel}`] += 1;
    } else if (s.status && s.status.includes('BLOCKED_L')) {
      const l = s.status.split('BLOCKED_L')[1];
      if (l && levelBlocks[`L${l}`] !== undefined) levelBlocks[`L${l}`] += 1;
    }
  });

  const blockChartData = Object.keys(levelBlocks).filter(k => levelBlocks[k] > 0).map(k => ({
    name: k,
    Blocked: levelBlocks[k]
  }));

  const pieData = [
    { name: 'Safe', value: safeScans },
    { name: 'Blocked / Warned', value: blockedScans }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans relative overflow-x-hidden">
      {/* Dynamic Background */}
      <div className="fixed top-[10%] left-[5%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-rose-600/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none"></div>

      <nav className="border-b border-slate-800/60 bg-slate-900/50 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center ring-1 ring-white/10 shadow-lg shadow-indigo-500/20">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
          </div>
          <span className="font-bold text-xl bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Guard{"NPM"} Analytics</span>
        </div>
        <div className="flex items-center gap-4">
          <Link 
            to="/"
            className="px-4 py-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-sm font-medium rounded-xl flex items-center gap-2 transition-all text-slate-300 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Scanner
          </Link>
          <button 
            onClick={handleLogout}
            className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-sm font-medium rounded-xl flex items-center gap-2 transition-all text-rose-400 hover:text-rose-300"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </nav>

      <main className="w-full max-w-[90rem] mx-auto p-4 md:p-8 relative z-10">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 mt-4">
          <div className="backdrop-blur-xl bg-slate-900/40 border border-slate-700/50 p-6 rounded-3xl shadow-xl flex items-center gap-4 group transition-all hover:bg-slate-800/40">
            <div className="p-4 bg-indigo-500/20 rounded-2xl group-hover:scale-110 transition-transform shadow-inner shadow-indigo-500/20">
               <FileArchive className="w-8 h-8 text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Total Deployments Scanned</p>
              <p className="text-3xl font-extrabold text-white mt-1 ">{totalScans}</p>
            </div>
          </div>
          
          <div className="backdrop-blur-xl bg-slate-900/40 border border-emerald-500/30 p-6 rounded-3xl shadow-xl flex items-center gap-4 group transition-all hover:bg-slate-800/40">
            <div className="p-4 bg-emerald-500/20 rounded-2xl group-hover:scale-110 transition-transform shadow-inner shadow-emerald-500/20">
               <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-400/80">Passed All Checks</p>
              <p className="text-3xl font-extrabold text-white mt-1">{safeScans}</p>
            </div>
          </div>

          <div className="backdrop-blur-xl bg-slate-900/40 border border-rose-500/30 p-6 rounded-3xl shadow-xl flex items-center gap-4 group transition-all hover:bg-slate-800/40">
            <div className="p-4 bg-rose-500/20 rounded-2xl group-hover:scale-110 transition-transform shadow-inner shadow-rose-500/20">
               <ShieldAlert className="w-8 h-8 text-rose-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-rose-400/80">Blocked Anomalies</p>
              <p className="text-3xl font-extrabold text-white mt-1">{blockedScans}</p>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="backdrop-blur-xl bg-slate-900/40 border border-slate-700/50 p-6 rounded-3xl shadow-xl">
            <h3 className="text-lg font-bold text-slate-200 mb-6 flex items-center gap-2">
               Overview Ratio
            </h3>
            <div className="h-[300px]">
              {totalScans > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={110}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#f43f5e'} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle"/>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500">No data available</div>
              )}
            </div>
          </div>

          <div className="backdrop-blur-xl bg-slate-900/40 border border-slate-700/50 p-6 rounded-3xl shadow-xl">
            <h3 className="text-lg font-bold text-slate-200 mb-6 flex items-center gap-2">
               Quarantine Breakdown by Level
            </h3>
            <div className="h-[300px]">
              {blockChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={blockChartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                    <XAxis dataKey="name" stroke="#64748b" tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                      cursor={{fill: '#1e293b'}}
                    />
                    <Bar dataKey="Blocked" fill="#8b5cf6" radius={[6, 6, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500">No block events recorded!</div>
              )}
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="backdrop-blur-xl bg-slate-900/40 border border-slate-700/50 rounded-3xl shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-800 bg-slate-900/50">
             <h3 className="text-lg font-bold text-slate-200">Recent Package Executions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-800/80 text-slate-300 text-sm border-b border-slate-700">
                  <th className="p-4 font-semibold tracking-wider uppercase text-xs">Package Name</th>
                  <th className="p-4 font-semibold tracking-wider uppercase text-xs">Size (KB)</th>
                  <th className="p-4 font-semibold tracking-wider uppercase text-xs">Status</th>
                  <th className="p-4 font-semibold tracking-wider uppercase text-xs">User ID</th>
                  <th className="p-4 font-semibold tracking-wider uppercase text-xs">Date Analyzed</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-800/50">
                {scans.slice(0, 15).map((scan) => (
                   <tr key={scan.id} className="hover:bg-slate-800/40 transition-colors">
                     <td className="p-4 font-medium text-slate-200 break-all max-w-[200px]">{scan.fileName}</td>
                     <td className="p-4 text-slate-400">{(scan.fileSize / 1024).toFixed(1)}</td>
                     <td className="p-4">
                       <span className={`px-3 py-1.5 rounded-full text-[11px] font-bold tracking-widest uppercase ${
                         scan.status?.includes('SAFE') 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                          : scan.status?.includes('WARNING')
                            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]'
                       }`}>
                         {scan.status?.replace(/_/g, ' ') || 'UNKNOWN'}
                       </span>
                     </td>
                     <td className="p-4 text-slate-400">{scan.userEmail}</td>
                     <td className="p-4 text-slate-400 whitespace-nowrap">
                       {scan.timestamp ? new Date(scan.timestamp.toDate()).toLocaleString() : 'N/A'}
                     </td>
                   </tr>
                ))}
                {scans.length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-slate-500">No packages have been scanned yet!</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
