import React, { useState } from 'react';
import { Tag, X, Plus } from 'lucide-react';
import Button from '@/components/ui/Button';

const PREDEFINED_CATEGORIES = [
  'Art',
  'Music',
  'Gaming',
  'Education',
  'Tech',
  'Writing',
  'Other'
];

interface ProfileCategoriesProps {
  selectedCategories: string[];
  customTags: string[];
  onCategoriesChange: (categories: string[]) => void;
  onTagsChange: (tags: string[]) => void;
  isEditing?: boolean;
}

/**
 * ProfileCategories component for managing creator categories and custom tags.
 * Supports predefined categories and up to 5 custom tags.
 */
const ProfileCategories: React.FC<ProfileCategoriesProps> = ({
  selectedCategories,
  customTags,
  onCategoriesChange,
  onTagsChange,
  isEditing = false
}) => {
  const [newTag, setNewTag] = useState('');
  const [tagError, setTagError] = useState('');

  const toggleCategory = (category: string) => {
    if (!isEditing) return;
    
    if (selectedCategories.includes(category)) {
      onCategoriesChange(selectedCategories.filter(c => c !== category));
    } else {
      onCategoriesChange([...selectedCategories, category]);
    }
  };

  const addCustomTag = () => {
    const trimmedTag = newTag.trim();
    
    if (!trimmedTag) {
      setTagError('Tag cannot be empty');
      return;
    }
    
    if (customTags.length >= 5) {
      setTagError('Maximum 5 tags allowed');
      return;
    }
    
    if (customTags.includes(trimmedTag)) {
      setTagError('Tag already exists');
      return;
    }
    
    if (trimmedTag.length > 20) {
      setTagError('Tag must be 20 characters or less');
      return;
    }
    
    onTagsChange([...customTags, trimmedTag]);
    setNewTag('');
    setTagError('');
  };

  const removeCustomTag = (tag: string) => {
    if (!isEditing) return;
    onTagsChange(customTags.filter(t => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomTag();
    }
  };

  return (
    <div className="space-y-6">
      {/* Predefined Categories */}
      <div>
        <h3 className="text-sm font-black uppercase tracking-wider mb-3 flex items-center gap-2">
          <Tag size={16} />
          Categories
        </h3>
        <div className="flex flex-wrap gap-2">
          {PREDEFINED_CATEGORIES.map((category) => {
            const isSelected = selectedCategories.includes(category);
            return (
              <button
                key={category}
                onClick={() => toggleCategory(category)}
                disabled={!isEditing}
                className={`
                  px-4 py-2 border-2 border-black font-bold text-sm uppercase tracking-wide
                  transition-all duration-150
                  ${isSelected 
                    ? 'bg-black text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' 
                    : 'bg-white text-black hover:bg-gray-100'
                  }
                  ${!isEditing && 'cursor-default opacity-80'}
                  ${isEditing && 'hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none'}
                `}
              >
                {category}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Tags */}
      <div>
        <h3 className="text-sm font-black uppercase tracking-wider mb-3">
          Custom Tags ({customTags.length}/5)
        </h3>
        
        {/* Display existing tags */}
        <div className="flex flex-wrap gap-2 mb-3">
          {customTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 border-2 border-black font-bold text-sm"
            >
              {tag}
              {isEditing && (
                <button
                  onClick={() => removeCustomTag(tag)}
                  className="hover:text-red-600 transition-colors"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X size={14} />
                </button>
              )}
            </span>
          ))}
          {customTags.length === 0 && !isEditing && (
            <span className="text-gray-500 text-sm font-bold">No custom tags</span>
          )}
        </div>

        {/* Add new tag input */}
        {isEditing && customTags.length < 5 && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => {
                  setNewTag(e.target.value);
                  setTagError('');
                }}
                onKeyDown={handleKeyDown}
                placeholder="Add a custom tag..."
                maxLength={20}
                className="flex-1 px-3 py-2 border-2 border-black font-bold text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
              <Button
                onClick={addCustomTag}
                variant="primary"
                size="sm"
                icon={<Plus size={16} />}
              >
                Add
              </Button>
            </div>
            {tagError && (
              <p className="text-red-600 text-xs font-bold">{tagError}</p>
            )}
            <p className="text-gray-500 text-xs font-bold">
              Press Enter or click Add to create a tag (max 20 characters)
            </p>
          </div>
        )}
        
        {isEditing && customTags.length >= 5 && (
          <p className="text-amber-600 text-xs font-bold">
            Maximum of 5 custom tags reached
          </p>
        )}
      </div>
    </div>
  );
};

export default ProfileCategories;