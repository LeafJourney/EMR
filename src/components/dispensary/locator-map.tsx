import React from "react";
import { MapPin, Navigation, Phone, Clock, ExternalLink } from "lucide-react";

export interface DispensaryProps {
  id: string;
  name: string;
  address: string;
  distance: string;
  isOpen: boolean;
  phone: string;
  isPartner?: boolean;
}

/**
 * Dispensary Locator Map Placeholder (EMR-017)
 * A visual placeholder for the upcoming Mapbox dispensary integration.
 */
export function LocatorMap({ dispensaries = [] }: { dispensaries?: DispensaryProps[] }) {
  const defaultDispensaries: DispensaryProps[] = [
    {
      id: "disp-1",
      name: "Verdant Apothecary Downtown",
      address: "123 Main St, Portland, OR",
      distance: "0.8 miles",
      isOpen: true,
      phone: "(555) 123-4567",
      isPartner: true,
    },
    {
      id: "disp-2",
      name: "Green Horizon Health",
      address: "456 Pearl Dist, Portland, OR",
      distance: "1.2 miles",
      isOpen: true,
      phone: "(555) 987-6543",
    },
  ];

  const list = dispensaries.length > 0 ? dispensaries : defaultDispensaries;

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm flex flex-col md:flex-row h-[500px]">
      
      {/* Sidebar List */}
      <div className="w-full md:w-1/3 border-r border-neutral-200 dark:border-neutral-800 flex flex-col h-full bg-neutral-50 dark:bg-neutral-900/50">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <h2 className="font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-600" />
            Nearby Dispensaries
          </h2>
          <input 
            type="text" 
            placeholder="Search by zip code..."
            className="w-full mt-3 px-3 py-2 text-sm bg-neutral-100 dark:bg-neutral-800 border-none rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
        
        <div className="overflow-y-auto flex-1 p-2 space-y-2">
          {list.map((d) => (
            <div 
              key={d.id} 
              className={`p-3 rounded-xl border ${d.isPartner ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900'} cursor-pointer hover:shadow-md transition-shadow`}
            >
              <div className="flex justify-between items-start">
                <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                  {d.name}
                </h3>
                <span className="text-xs font-medium text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
                  {d.distance}
                </span>
              </div>
              
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 line-clamp-1">
                {d.address}
              </p>
              
              <div className="flex items-center gap-3 mt-3 text-xs">
                <span className={`font-medium flex items-center gap-1 ${d.isOpen ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                  <Clock className="w-3 h-3" />
                  {d.isOpen ? 'Open Now' : 'Closed'}
                </span>
                <span className="text-neutral-500 flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {d.phone}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Map Placeholder Area */}
      <div className="w-full md:w-2/3 h-full relative bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
        {/* Placeholder Map Pattern */}
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" 
             style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, black 1px, transparent 0)', backgroundSize: '24px 24px' }}>
        </div>
        
        <div className="relative z-10 flex flex-col items-center text-center p-6 max-w-sm">
          <div className="w-16 h-16 bg-white dark:bg-neutral-900 rounded-2xl shadow-lg flex items-center justify-center mb-4">
            <Navigation className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">
            Map Integration Pending
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
            Interactive map rendering is currently disabled. The Mapbox integration (EMR-018) is scheduled for the next sprint.
          </p>
          <button className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg flex items-center gap-2 transition-colors">
            Open in Google Maps
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>
      
    </div>
  );
}
