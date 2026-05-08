import React, { useState } from "react";
import { ZoomIn, ZoomOut, Maximize, FileImage, Settings2, Play } from "lucide-react";

export interface DicomImage {
  id: string;
  name: string;
  date: string;
  modality: "MRI" | "CT" | "X-RAY";
  imageUrl: string;
}

/**
 * DICOM Viewer Scaffold Component (EMR-014)
 * A placeholder structure for viewing DICOM medical imaging files.
 */
export function DicomViewer({ image }: { image?: DicomImage }) {
  const [zoom, setZoom] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [brightness, setBrightness] = useState(100);

  if (!image) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] bg-neutral-900 rounded-xl border border-neutral-800 text-neutral-500">
        <FileImage className="w-16 h-16 mb-4 opacity-50" />
        <p className="font-medium text-lg text-neutral-400">No Image Selected</p>
        <p className="text-sm">Select a scan from the patient records to view.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[600px] bg-black rounded-xl overflow-hidden border border-neutral-800 shadow-2xl relative select-none group">
      
      {/* Top HUD */}
      <div className="absolute top-0 inset-x-0 p-4 flex justify-between items-start z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-b from-black/80 to-transparent">
        <div className="text-emerald-400 font-mono text-sm pointer-events-auto">
          <div className="font-bold text-white mb-1">{image.name}</div>
          <div className="text-xs text-neutral-400">Modality: {image.modality}</div>
          <div className="text-xs text-neutral-400">Date: {image.date}</div>
        </div>
        
        <div className="text-right text-emerald-400 font-mono text-xs pointer-events-auto">
          <div>Z: {zoom}%</div>
          <div>C: {contrast}%</div>
          <div>B: {brightness}%</div>
        </div>
      </div>

      {/* Main Image Area */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative cursor-crosshair">
        {/* Mock Image Representation */}
        <div 
          className="w-full h-full flex items-center justify-center bg-neutral-950 transition-transform duration-200"
          style={{ 
            transform: `scale(${zoom / 100})`,
            filter: `contrast(${contrast}%) brightness(${brightness}%)`
          }}
        >
          {image.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img 
              src={image.imageUrl} 
              alt={image.name} 
              className="max-w-full max-h-full object-contain mix-blend-screen"
              draggable={false}
            />
          ) : (
            <div className="w-64 h-64 border border-emerald-900/50 rounded-full flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-800 to-black">
              <span className="text-neutral-700 font-mono text-xs text-center">
                [ DICOM PIXEL DATA ]<br />
                {image.modality} VIEW
              </span>
            </div>
          )}
        </div>
        
        {/* Pending Integration Overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none backdrop-blur-[2px] bg-black/20">
          <div className="bg-black/80 text-emerald-400 border border-emerald-900/50 px-6 py-4 rounded-lg flex flex-col items-center">
            <Settings2 className="w-8 h-8 mb-2 animate-pulse" />
            <h3 className="font-mono font-bold tracking-widest text-sm">CORNERSTONE.JS PENDING</h3>
            <p className="text-[10px] text-neutral-400 mt-2 max-w-[250px] text-center">
              True DICOM rendering engine (EMR-015) will replace this placeholder in Phase 2.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Controls Bar */}
      <div className="bg-neutral-900 border-t border-neutral-800 p-3 flex items-center justify-center gap-6 z-10">
        <div className="flex items-center bg-black rounded-lg border border-neutral-800 overflow-hidden">
          <button 
            onClick={() => setZoom(Math.max(50, zoom - 10))}
            className="p-2 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-neutral-800"></div>
          <button 
            onClick={() => setZoom(100)}
            className="px-3 text-xs font-mono text-emerald-500 hover:text-emerald-400"
          >
            RESET
          </button>
          <div className="w-px h-5 bg-neutral-800"></div>
          <button 
            onClick={() => setZoom(Math.min(300, zoom + 10))}
            className="p-2 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
        
        <div className="h-5 w-px bg-neutral-800"></div>
        
        <button className="p-2 bg-black rounded-lg border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors" title="Cine Play">
          <Play className="w-4 h-4" />
        </button>
        
        <button className="p-2 bg-black rounded-lg border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors" title="Maximize View">
          <Maximize className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
