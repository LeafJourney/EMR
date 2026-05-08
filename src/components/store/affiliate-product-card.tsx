import React from "react";
import { ExternalLink, Star, Tag, ShoppingBag } from "lucide-react";

export interface AffiliateProductProps {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  imageUrl: string;
  affiliateUrl: string;
  rating?: number;
  discountBadge?: string;
}

/**
 * Affiliate Product Card (EMR-039)
 * Displays curated third-party products (e.g. vaporizers, scales) with affiliate links.
 */
export function AffiliateProductCard({ product }: { product: AffiliateProductProps }) {
  return (
    <div className="group relative flex flex-col bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden hover:shadow-lg transition-all duration-300 hover:border-emerald-200 dark:hover:border-emerald-800">
      {/* Product Image Area */}
      <div className="relative aspect-square w-full bg-neutral-50 dark:bg-neutral-800/50 p-6 flex items-center justify-center overflow-hidden group-hover:bg-emerald-50/50 dark:group-hover:bg-emerald-900/10 transition-colors">
        {product.discountBadge && (
          <div className="absolute top-3 right-3 bg-rose-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-sm z-10 flex items-center gap-1">
            <Tag className="w-3 h-3" />
            {product.discountBadge}
          </div>
        )}
        
        {/* Placeholder image fallback if URL is empty */}
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img 
            src={product.imageUrl} 
            alt={product.name}
            className="w-full h-full object-contain filter group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <ShoppingBag className="w-16 h-16 text-neutral-300 dark:text-neutral-700" />
        )}
      </div>

      {/* Product Details Area */}
      <div className="flex flex-col flex-grow p-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            {product.brand}
          </span>
          {product.rating && (
            <div className="flex items-center gap-1 text-amber-500">
              <Star className="w-3.5 h-3.5 fill-current" />
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                {product.rating}
              </span>
            </div>
          )}
        </div>
        
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white leading-tight mb-2 line-clamp-2">
          {product.name}
        </h3>
        
        <div className="mt-auto pt-4 flex items-end justify-between border-t border-neutral-100 dark:border-neutral-800">
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-500">Partner Price</span>
            <span className="text-xl font-bold text-neutral-900 dark:text-white">
              ${product.price.toFixed(2)}
            </span>
          </div>
          
          <a
            href={product.affiliateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 dark:hover:bg-emerald-400 transition-colors"
          >
            Buy Now
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
