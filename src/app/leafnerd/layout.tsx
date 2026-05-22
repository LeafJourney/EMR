import type { Metadata } from "next";
import { SidebarNav } from "@/components/leafnerd/SidebarNav";

const THEME_BOOTSTRAP = `
(function(){try{
  var t=localStorage.getItem('leafnerd-theme');
  if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
  if(t==='dark'){
    var els=document.getElementsByClassName('theme-leafmart');
    for(var i=0;i<els.length;i++){els[i].classList.add('dark');}
  }
}catch(e){}})();
`;

export const metadata: Metadata = {
  title: "LeafNerd — Clinical Intelligence",
  description: "Advanced clinical data intelligence and AI insights.",
};

export default function LeafNerdLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-leafmart min-h-screen bg-bg text-text font-sans antialiased selection:bg-highlight-soft selection:text-accent-strong" suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border/10 bg-bg-surface hidden md:flex flex-col z-10 relative">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-accent-strong tracking-tight">LeafNerd</h1>
            <p className="text-[10px] text-text-muted mt-1 uppercase tracking-widest font-bold">Intelligence Overlay</p>
          </div>
          <SidebarNav />

          <div className="p-4 border-t border-border/10">
            <div className="flex items-center space-x-3 px-2 py-2">
              <div className="w-8 h-8 rounded-full bg-accent-strong/10 border border-accent-strong/20 flex items-center justify-center text-accent-strong font-bold text-xs">LN</div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-text-strong">Pro Access</span>
                <span className="text-[10px] text-text-muted">Connected to LeafJourney</span>
              </div>
            </div>
          </div>
        </aside>
        
        {/* Main Content */}
        <main className="flex-1 overflow-y-auto relative bg-bg">
          {children}
        </main>
      </div>
    </div>
  );
}
