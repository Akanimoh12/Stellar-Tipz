import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Send, Trash2, ArrowUpDown, Users } from "lucide-react";

import Avatar from "../../components/ui/Avatar";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { useFavorites } from "../../hooks/useFavorites";

const FavoritesList: React.FC = () => {
  const {
    favorites,
    sortedFavorites,
    removeFavorite,
    recordTip,
    isAuthenticated,
  } = useFavorites();
  const [sortBy, setSortBy] = useState<
    "recent" | "most_tipped" | "alphabetical"
  >("recent");
  const navigate = useNavigate();

  const sortedList = sortedFavorites(sortBy);

  if (favorites.length === 0) {
    return (
      <Card className="p-8 text-center border-4 border-dashed border-gray-200 bg-gray-50/50 shadow-none">
        <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <Users className="h-8 w-8 text-gray-700 dark:text-gray-300" />
        </div>
        <h3 className="text-lg font-black uppercase text-gray-900 mb-2">
          No favorites yet
        </h3>
        <p className="text-gray-800 dark:text-gray-200 font-bold max-w-xs mx-auto text-sm">
          Add creators to your favorites for quick access and faster tipping.
        </p>
        <Button
          variant="outline"
          className="mt-6 bg-white border-2 border-black shadow-brutalist hover:shadow-none transition-all"
          onClick={() => navigate("/leaderboard")}
        >
          Explore Creators
        </Button>
      </Card>
    );
  }

  const handleRemove = (address: string, username: string) => {
    if (
      window.confirm(
        `Are you sure you want to remove @${username} from your favorites?`,
      )
    ) {
      removeFavorite(address);
    }
  };

  const handleQuickTip = (address: string, username: string) => {
    recordTip(address);
    navigate(`/@${username}`);
  };

  return (
    <div className="space-y-6">
      {!isAuthenticated && (
        <div
          role="status"
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-2 border-black bg-yellow-100 px-4 py-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
        >
          <p className="text-sm font-bold text-gray-900">
            Sign in to sync your favorites across devices. Your local list is
            kept until then.
          </p>
          <Button
            type="button"
            variant="outline"
            className="bg-white shrink-0"
            onClick={() => navigate("/")}
          >
            Sign in
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black uppercase flex items-center gap-2 tracking-tight">
          <Heart className="text-red-500 fill-red-500" size={24} />
          Favorites
        </h2>
        <div className="flex items-center gap-2 border-2 border-black bg-white px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <ArrowUpDown size={14} className="text-black" />
          <select
            value={sortBy}
            onChange={(e) =>
              setSortBy(
                e.target.value as "recent" | "most_tipped" | "alphabetical",
              )
            }
            className="bg-transparent border-none text-xs font-black uppercase focus:ring-0 cursor-pointer p-0 pr-6"
          >
            <option value="recent">Recently Added</option>
            <option value="most_tipped">Most Tipped</option>
            <option value="alphabetical">Alphabetical</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedList.map((creator) => (
          <Card
            key={creator.address}
            padding="sm"
            className="flex items-center justify-between gap-4 border-2 border-black hover:shadow-brutalist transition-all"
          >
            <div
              className="flex items-center gap-3 min-w-0 cursor-pointer group"
              onClick={() => navigate(`/@${creator.username}`)}
            >
              <Avatar
                address={creator.address}
                alt={creator.username}
                size="md"
                className="border-2 border-black"
              />
              <div className="truncate">
                <p className="font-black uppercase truncate group-hover:underline">
                  @{creator.username}
                </p>
                <p className="text-[10px] font-black uppercase text-gray-800 dark:text-gray-200">
                  {creator.tipCount} tips sent
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  handleQuickTip(creator.address, creator.username)
                }
                className="p-2 text-black hover:bg-yellow-200 border-2 border-transparent hover:border-black transition-all rounded"
                title="Quick Tip"
              >
                <Send size={18} />
              </button>
              <button
                onClick={() => handleRemove(creator.address, creator.username)}
                className="p-2 text-gray-700 dark:text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors rounded"
                title="Remove"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default FavoritesList;
