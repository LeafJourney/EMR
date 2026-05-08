import React from "react";
import { Users, MessagesSquare, SmilePlus, Video } from "lucide-react";

export function SocialConnectivityCard() {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
      <div className="bg-blue-50 dark:bg-blue-900/20 px-6 py-5 border-b border-blue-100 dark:border-blue-900/30">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-blue-100 dark:bg-blue-800 p-2 rounded-xl">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-blue-900 dark:text-blue-100">
            Social Connectivity
          </h2>
        </div>
        <p className="text-sm text-blue-700 dark:text-blue-400">
          Isolation increases systemic inflammation. Maintaining positive social ties is a biological necessity.
        </p>
      </div>

      <div className="p-6">
        <div className="space-y-4">
          <div className="flex gap-4 items-start p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 rounded-xl transition-colors">
            <div className="bg-neutral-100 dark:bg-neutral-800 p-2 rounded-lg shrink-0 mt-1 border border-neutral-200 dark:border-neutral-700">
              <MessagesSquare className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">Community Support Groups</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">Join the Verdant Apothecary patient community to share experiences and ask questions.</p>
            </div>
          </div>
          
          <div className="flex gap-4 items-start p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 rounded-xl transition-colors">
            <div className="bg-neutral-100 dark:bg-neutral-800 p-2 rounded-lg shrink-0 mt-1 border border-neutral-200 dark:border-neutral-700">
              <SmilePlus className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">Daily Micro-Interactions</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">Aim for at least one meaningful interaction daily, even if just a 5-minute phone call.</p>
            </div>
          </div>
          
          <button className="w-full mt-2 py-2.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
            <Video className="w-4 h-4" />
            Join Next Virtual Group
          </button>
        </div>
      </div>
    </div>
  );
}
