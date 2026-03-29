import React from 'react';
import { Github, Twitter } from 'lucide-react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
  return (
    <footer className="border-t-3 border-black bg-white dark:bg-black dark:border-white py-10">
      <div className="max-w-6xl mx-auto px-4">
        {/* Navigation grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* Brand column */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg font-black">TIPZ</span>
              <span>💫</span>
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Built on Stellar</span>
            <a
              href="https://soroban.stellar.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:opacity-60 transition-opacity w-fit"
            >
              ⚡ Powered by Stellar Soroban
            </a>
          </div>

          {/* Product */}
          <div className="flex flex-col gap-2">
            <h3 className="font-black text-sm uppercase tracking-wide">Product</h3>
            <Link to="/" className="text-sm text-gray-600 dark:text-gray-400 hover:opacity-60 transition-opacity w-fit">Home</Link>
            <Link to="/leaderboard" className="text-sm text-gray-600 dark:text-gray-400 hover:opacity-60 transition-opacity w-fit">Leaderboard</Link>
            <Link to="/dashboard" className="text-sm text-gray-600 dark:text-gray-400 hover:opacity-60 transition-opacity w-fit">Dashboard</Link>
          </div>

          {/* Resources */}
          <div className="flex flex-col gap-2">
            <h3 className="font-black text-sm uppercase tracking-wide">Resources</h3>
            <a href="/docs" className="text-sm text-gray-600 dark:text-gray-400 hover:opacity-60 transition-opacity w-fit">Docs</a>
            <a
              href="https://github.com/Akanimoh12/Stellar-Tipz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-600 dark:text-gray-400 hover:opacity-60 transition-opacity w-fit"
            >
              GitHub
            </a>
            <a
              href="https://soroban.stellar.org/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-600 dark:text-gray-400 hover:opacity-60 transition-opacity w-fit"
            >
              Contract Spec
            </a>
          </div>

          {/* Community */}
          <div className="flex flex-col gap-2">
            <h3 className="font-black text-sm uppercase tracking-wide">Community</h3>
            <a
              href="https://twitter.com/TipzApp"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:opacity-60 transition-opacity w-fit"
            >
              <Twitter size={14} /> Twitter
            </a>
            <a
              href="https://discord.gg/stellardev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:opacity-60 transition-opacity w-fit"
            >
              <Github size={14} /> Stellar Discord
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            &copy; {new Date().getFullYear()} Stellar Tipz. MIT License.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/Akanimoh12/Stellar-Tipz"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-60 transition-opacity"
              aria-label="GitHub"
            >
              <Github size={18} />
            </a>
            <a
              href="https://twitter.com/TipzApp"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-60 transition-opacity"
              aria-label="Twitter"
            >
              <Twitter size={18} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
