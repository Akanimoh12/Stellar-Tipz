import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X, Clock, Loader2, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Profile } from "@/types";
import { useSearch } from "@/hooks/useSearch";
import Avatar from "@/components/ui/Avatar";
import { truncateString } from "@/helpers/format";

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

interface HighlightedTextProps {
  text: string;
  matches?: { indices: [number, number][]; key: string }[];
  matchKey: string;
}

const HighlightedText: React.FC<HighlightedTextProps> = ({
  text,
  matches,
  matchKey,
}) => {
  if (!matches) {
    return <>{text}</>;
  }

  const match = matches.find((m) => m.key === matchKey);
  if (!match || match.indices.length === 0) {
    return <>{text}</>;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  match.indices.forEach(([start, end], i) => {
    if (start > lastIndex) {
      parts.push(
        <span key={`text-${i}`}>{text.slice(lastIndex, start)}</span>,
      );
    }
    parts.push(
      <mark
        key={`mark-${i}`}
        className="bg-yellow-200 dark:bg-yellow-500 dark:text-black font-bold"
      >
        {text.slice(start, end + 1)}
      </mark>,
    );
    lastIndex = end + 1;
  });

  if (lastIndex < text.length) {
    parts.push(<span key="text-last">{text.slice(lastIndex)}</span>);
  }

  return <>{parts}</>;
};

const GlobalSearch: React.FC<GlobalSearchProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedIndex, setSelectedIndex] = useState(0);

  const {
    query,
    setQuery,
    results,
    isLoading,
    recentSearches,
    addToRecent,
    clearRecent,
    hasSearched,
  } = useSearch();

  const displayResults = query.trim() ? results : [];
  const showRecent = !query.trim() && recentSearches.length > 0;
  const showEmpty =
    hasSearched && !isLoading && results.length === 0 && query.trim();
  const showSuggestions = !query.trim() && recentSearches.length === 0;

  useLayoutEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleSelect = useCallback(
    (profile: Profile) => {
      addToRecent(profile);
      onClose();
      navigate(`/@${profile.username}`);
    },
    [addToRecent, onClose, navigate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const totalItems =
        displayResults.length > 0 ? displayResults.length : recentSearches.length;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % totalItems);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const items = displayResults.length > 0 ? displayResults : recentSearches.map((p) => ({ item: p }));
        if (items[selectedIndex]) {
          handleSelect(items[selectedIndex].item);
        }
      }
    },
    [displayResults, recentSearches, selectedIndex, handleSelect],
  );

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      role="presentation"
    >
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 bg-black bg-opacity-60"
          onClick={handleBackdropClick}
          role="presentation"
          aria-hidden="true"
        />
      </AnimatePresence>

      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="relative z-10 w-full max-w-lg border-[3px] border-black bg-white dark:bg-black"
        style={{ boxShadow: "6px 6px 0px 0px rgba(0,0,0,1)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
      >
        <div className="flex items-center border-b-[3px] border-black px-4 py-3">
          <Search size={16} className="text-gray-500 shrink-0" />
          <span className="ml-2 mr-2 text-xs font-black uppercase tracking-[0.2em] text-gray-500">
            Search
          </span>
          <input
            ref={inputRef}
            type="text"
            role="searchbox"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search creators, usernames..."
            className="flex-1 bg-transparent text-sm font-medium placeholder:text-gray-400 focus:outline-none"
            aria-label="Search creators"
            aria-autocomplete="list"
            aria-controls="search-results"
          />
          {isLoading ? (
            <Loader2 size={16} className="animate-spin text-gray-400" />
          ) : query ? (
            <button
              onClick={() => setQuery("")}
              className="text-gray-400 hover:text-black dark:hover:text-white transition-colors"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>

        <div
          ref={listRef}
          id="search-results"
          className="max-h-80 overflow-y-auto"
          role="listbox"
          aria-label="Search results"
        >
          {showSuggestions && (
            <div className="px-4 py-8 text-center">
              <Search size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">
                Search for creators by username or display name
              </p>
              <p className="mt-2 text-xs text-gray-400">
                Try: "stellarjane" or "orbitmax"
              </p>
            </div>
          )}

          {showRecent && (
            <div>
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Recent searches
                </span>
                <button
                  onClick={clearRecent}
                  className="text-xs text-gray-400 hover:text-black dark:hover:text-white transition-colors"
                >
                  Clear
                </button>
              </div>
              {recentSearches.map((profile, index) => (
                <button
                  key={profile.owner}
                  role="option"
                  data-index={index}
                  onClick={() => handleSelect(profile)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-900 ${
                    selectedIndex === index
                      ? "bg-gray-100 dark:bg-gray-800"
                      : ""
                  }`}
                  aria-selected={selectedIndex === index}
                >
                  <Clock size={14} className="text-gray-400 shrink-0" />
                  <Avatar
                    alt={profile.displayName || profile.username}
                    address={profile.owner}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      <HighlightedText
                        text={profile.displayName || profile.username}
                        matchKey="displayName"
                      />
                    </p>
                    <p className="truncate text-xs text-gray-400">
                      @{profile.username} · {truncateString(profile.owner)}
                    </p>
                  </div>
                  <ArrowRight
                    size={14}
                    className="text-gray-300 shrink-0"
                  />
                </button>
              ))}
            </div>
          )}

          {displayResults.map((result, index) => {
            const profile = result.item;
            return (
              <button
                key={profile.owner}
                role="option"
                data-index={index}
                onClick={() => handleSelect(profile)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-900 ${
                  selectedIndex === index
                    ? "bg-gray-100 dark:bg-gray-800"
                    : ""
                }`}
                aria-selected={selectedIndex === index}
              >
                <Avatar
                  alt={profile.displayName || profile.username}
                  address={profile.owner}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    <HighlightedText
                      text={profile.displayName || profile.username}
                      matches={result.matches}
                      matchKey="displayName"
                    />
                  </p>
                  <p className="truncate text-xs text-gray-400">
                    <HighlightedText
                      text={`@${profile.username}`}
                      matches={result.matches}
                      matchKey="username"
                    />{" "}
                    · {truncateString(profile.owner)}
                  </p>
                </div>
                <ArrowRight size={14} className="text-gray-300 shrink-0" />
              </button>
            );
          })}

          {showEmpty && (
            <div className="px-4 py-8 text-center">
              <Search size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">
                No results found for "{query}"
              </p>
              <p className="mt-2 text-xs text-gray-400">
                Try searching for a different username
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t-[3px] border-black px-4 py-2">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <kbd className="border border-gray-300 px-1.5 py-0.5 font-mono text-xs">
                ↑
              </kbd>
              <kbd className="border border-gray-300 px-1.5 py-0.5 font-mono text-xs">
                ↓
              </kbd>
              <span className="ml-1">to navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="border border-gray-300 px-1.5 py-0.5 font-mono text-xs">
                ↵
              </kbd>
              <span className="ml-1">to select</span>
            </span>
          </div>
          <span className="text-xs font-medium text-gray-400">
            Press{" "}
            <kbd className="border border-gray-300 px-1 font-mono text-xs">
              Esc
            </kbd>{" "}
            to close
          </span>
        </div>
      </motion.div>
    </div>
  );
};

export default GlobalSearch;