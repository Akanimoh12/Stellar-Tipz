import React from "react";
import { Github, Twitter } from "lucide-react";
import { Link } from "react-router-dom";

import { Language, useI18n } from "@/i18n";

const languages: Language[] = ["en", "es", "fr", "pt"];

const Footer: React.FC = () => {
  const { language, languageNames, setLanguage, t } = useI18n();

  return (
    <footer className="border-t-3 border-black bg-white py-10 dark:border-white dark:bg-black">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg font-black">TIPZ</span>
              <span>*</span>
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {t("footer.builtOn")}
            </span>
            <a
              href="https://soroban.stellar.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1 text-sm text-gray-600 transition-opacity hover:opacity-60 dark:text-gray-400"
            >
              {t("footer.powered")}
            </a>
            <label className="mt-2 flex flex-col gap-1 text-xs font-black uppercase tracking-wide">
              {t("footer.language")}
              <select
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as Language)
                }
                className="h-10 border-2 border-black bg-white px-2 text-sm font-bold normal-case tracking-normal dark:border-white dark:bg-black"
              >
                {languages.map((option) => (
                  <option key={option} value={option}>
                    {languageNames[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-black uppercase tracking-wide">
              {t("footer.product")}
            </h3>
            <Link
              to="/"
              className="w-fit text-sm text-gray-600 transition-opacity hover:opacity-60 dark:text-gray-400"
            >
              {t("footer.home")}
            </Link>
            <Link
              to="/leaderboard"
              className="w-fit text-sm text-gray-600 transition-opacity hover:opacity-60 dark:text-gray-400"
            >
              {t("nav.leaderboard")}
            </Link>
            <Link
              to="/dashboard"
              className="w-fit text-sm text-gray-600 transition-opacity hover:opacity-60 dark:text-gray-400"
            >
              {t("nav.dashboard")}
            </Link>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-black uppercase tracking-wide">
              {t("footer.resources")}
            </h3>
            <a
              href="/docs"
              className="w-fit text-sm text-gray-600 transition-opacity hover:opacity-60 dark:text-gray-400"
            >
              {t("footer.docs")}
            </a>
            <a
              href="https://github.com/Akanimoh12/Stellar-Tipz"
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit text-sm text-gray-600 transition-opacity hover:opacity-60 dark:text-gray-400"
            >
              GitHub
            </a>
            <a
              href="https://soroban.stellar.org/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit text-sm text-gray-600 transition-opacity hover:opacity-60 dark:text-gray-400"
            >
              {t("footer.contractSpec")}
            </a>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-black uppercase tracking-wide">
              {t("footer.community")}
            </h3>
            <a
              href="https://twitter.com/TipzApp"
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1 text-sm text-gray-600 transition-opacity hover:opacity-60 dark:text-gray-400"
            >
              <Twitter size={14} /> Twitter
            </a>
            <a
              href="https://discord.gg/stellardev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1 text-sm text-gray-600 transition-opacity hover:opacity-60 dark:text-gray-400"
            >
              <Github size={14} /> Stellar Discord
            </a>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-200 pt-6 dark:border-gray-700 sm:flex-row">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            &copy; {new Date().getFullYear()} {t("footer.license")}
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/Akanimoh12/Stellar-Tipz"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-60"
              aria-label="GitHub"
            >
              <Github size={18} />
            </a>
            <a
              href="https://twitter.com/TipzApp"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-60"
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
