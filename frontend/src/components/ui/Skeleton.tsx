import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200/80 rounded-lg ${className}`} />
);

// Matches the exact shape of a product card so the grid doesn't jump on load.
export const ProductCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden flex flex-col">
    <Skeleton className="h-44 w-full rounded-none" />
    <div className="p-4 flex flex-col flex-1 gap-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3 mb-2" />
      <div className="flex items-center justify-between mt-auto pt-1">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>
    </div>
  </div>
);

export const ProductGridSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
    {Array.from({ length: count }).map((_, i) => (
      <ProductCardSkeleton key={i} />
    ))}
  </div>
);

export default Skeleton;
