import React from 'react';
import { Filter } from 'lucide-react';

const CATEGORIES = [
  'All',
  'Art',
  'Music',
  'Gaming',
  'Education',
  'Tech',
  'Writing',
  'Other'
];

interface CategoryFilterProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

/**
 * CategoryFilter component for filtering leaderboard by creator category.
 */
const CategoryFilter: React.FC<CategoryFilterProps> = ({
  selectedCategory,
  onCategoryChange
}) => {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
        <Filter size={16} />
        Filter by Category
      </h3>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((category) => {
          const isSelected = selectedCategory === category;
          return (
            <button
              key={category}
              onClick={() => onCategoryChange(category)}
              className={`
                px-4 py-2 border-2 border-black font-bold text-sm uppercase tracking-wide
                transition-all duration-150
                ${isSelected 
                  ? 'bg-black text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' 
                  : 'bg-white text-black hover:bg-gray-100 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none'
                }
              `}
            >
              {category}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CategoryFilter;